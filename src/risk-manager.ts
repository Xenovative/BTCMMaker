/**
 * 風險管理器 - 處理滑點、手續費、流動性和 API 限制
 */
import { config } from './config.js';

interface OrderBookLevel {
  price: number;
  size: number;
}

interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

interface TradeAnalysis {
  canTrade: boolean;
  reason: string;
  effectivePrice: number;
  slippage: number;
  estimatedFee: number;
  netProfit: number;
  availableLiquidity: number;
}

export class RiskManager {
  private requestTimestamps: number[] = [];
  private lastRequestTime: number = 0;

  /**
   * 檢查 API rate limit
   */
  async checkRateLimit(): Promise<boolean> {
    const now = Date.now();

    // 清理超過 1 分鐘的記錄
    this.requestTimestamps = this.requestTimestamps.filter(
      (t) => now - t < 60000
    );

    // 檢查每分鐘請求數
    if (this.requestTimestamps.length >= config.MAX_REQUESTS_PER_MINUTE) {
      console.warn(`[風控] API 限制: 每分鐘 ${config.MAX_REQUESTS_PER_MINUTE} 次已達上限`);
      return false;
    }

    // 檢查最小間隔
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < config.MIN_REQUEST_INTERVAL_MS) {
      await this.sleep(config.MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest);
    }

    this.requestTimestamps.push(now);
    this.lastRequestTime = Date.now();
    return true;
  }

  /**
   * 分析訂單簿深度和滑點
   */
  analyzeOrderBook(
    orderBook: OrderBook,
    side: 'BUY' | 'SELL',
    size: number,
    targetPrice: number
  ): TradeAnalysis {
    const levels = side === 'BUY' ? orderBook.asks : orderBook.bids;

    if (!levels || levels.length === 0) {
      return {
        canTrade: false,
        reason: '訂單簿為空',
        effectivePrice: 0,
        slippage: 0,
        estimatedFee: 0,
        netProfit: 0,
        availableLiquidity: 0,
      };
    }

    // 計算可用流動性
    let totalLiquidity = 0;
    let filledSize = 0;
    let totalCost = 0;

    for (const level of levels) {
      totalLiquidity += level.size;

      const fillAtThisLevel = Math.min(level.size, size - filledSize);
      if (fillAtThisLevel > 0) {
        totalCost += fillAtThisLevel * level.price;
        filledSize += fillAtThisLevel;
      }

      if (filledSize >= size) break;
    }

    // 流動性不足
    if (filledSize < size) {
      return {
        canTrade: false,
        reason: `流動性不足: 需要 ${size}, 可用 ${filledSize.toFixed(0)}`,
        effectivePrice: 0,
        slippage: 0,
        estimatedFee: 0,
        netProfit: 0,
        availableLiquidity: totalLiquidity,
      };
    }

    // 計算有效價格和滑點
    const effectivePrice = (totalCost / filledSize) * 100; // 轉為 cents
    const bestPrice = levels[0].price * 100;
    const slippage = Math.abs(effectivePrice - bestPrice);

    // 檢查滑點
    if (slippage > config.MAX_SLIPPAGE_CENTS) {
      return {
        canTrade: false,
        reason: `滑點過大: ${slippage.toFixed(2)}¢ > ${config.MAX_SLIPPAGE_CENTS}¢`,
        effectivePrice,
        slippage,
        estimatedFee: 0,
        netProfit: 0,
        availableLiquidity: totalLiquidity,
      };
    }

    // 檢查最小深度
    if (totalLiquidity < config.MIN_ORDERBOOK_DEPTH) {
      return {
        canTrade: false,
        reason: `訂單簿深度不足: ${totalLiquidity.toFixed(0)} < ${config.MIN_ORDERBOOK_DEPTH}`,
        effectivePrice,
        slippage,
        estimatedFee: 0,
        netProfit: 0,
        availableLiquidity: totalLiquidity,
      };
    }

    // 計算手續費 (taker fee)
    const estimatedFee = (totalCost * config.TAKER_FEE_PERCENT) / 100;

    return {
      canTrade: true,
      reason: 'OK',
      effectivePrice,
      slippage,
      estimatedFee: estimatedFee * 100, // 轉為 cents
      netProfit: 0, // 需要賣出價格才能計算
      availableLiquidity: totalLiquidity,
    };
  }

  /**
   * 計算考慮手續費後的淨利潤
   */
  calculateNetProfit(
    buyPrice: number, // cents
    sellPrice: number, // cents
    size: number
  ): { grossProfit: number; fees: number; netProfit: number; profitable: boolean } {
    const grossProfit = (sellPrice - buyPrice) * size;

    // 買入和賣出都收 taker fee
    const buyFee = (buyPrice * size * config.TAKER_FEE_PERCENT) / 100;
    const sellFee = (sellPrice * size * config.TAKER_FEE_PERCENT) / 100;
    const totalFees = buyFee + sellFee;

    const netProfit = grossProfit - totalFees;

    return {
      grossProfit,
      fees: totalFees,
      netProfit,
      profitable: netProfit > 0,
    };
  }

  /**
   * 計算達到目標淨利潤所需的最小價格變動
   */
  calculateMinPriceMove(
    buyPrice: number, // cents
    targetNetProfit: number, // cents per share
    size: number
  ): number {
    // netProfit = (sellPrice - buyPrice) * size - fees
    // fees = (buyPrice + sellPrice) * size * feeRate / 100
    // 
    // 設 sellPrice = buyPrice + x
    // netProfit = x * size - (2 * buyPrice + x) * size * feeRate / 100
    // 
    // 解 x:
    const feeRate = config.TAKER_FEE_PERCENT / 100;
    const minMove = (targetNetProfit / size + 2 * buyPrice * feeRate) / (1 - feeRate);

    return Math.ceil(minMove * 10) / 10; // 向上取整到 0.1¢
  }

  /**
   * 檢查是否在安全交易時間窗口內
   */
  checkTimeWindow(timeToStart: number): { canTrade: boolean; reason: string } {
    if (timeToStart <= config.SELL_BEFORE_START_MS) {
      return {
        canTrade: false,
        reason: `距離開盤 ${Math.round(timeToStart / 1000)}s，需要清倉`,
      };
    }

    if (timeToStart <= config.MIN_TIME_TO_TRADE_MS) {
      return {
        canTrade: false,
        reason: `距離開盤 ${Math.round(timeToStart / 1000)}s < ${config.MIN_TIME_TO_TRADE_MS / 1000}s，暫停交易`,
      };
    }

    return { canTrade: true, reason: 'OK' };
  }

  /**
   * 綜合風險評估
   */
  async assessTradeRisk(
    orderBook: OrderBook,
    side: 'BUY' | 'SELL',
    size: number,
    targetPrice: number,
    timeToStart: number
  ): Promise<{ approved: boolean; reasons: string[]; analysis: TradeAnalysis | null }> {
    const reasons: string[] = [];

    // 1. 檢查 API 限制
    const rateLimitOk = await this.checkRateLimit();
    if (!rateLimitOk) {
      reasons.push('API rate limit');
    }

    // 2. 檢查時間窗口
    const timeCheck = this.checkTimeWindow(timeToStart);
    if (!timeCheck.canTrade) {
      reasons.push(timeCheck.reason);
    }

    // 3. 分析訂單簿
    const analysis = this.analyzeOrderBook(orderBook, side, size, targetPrice);
    if (!analysis.canTrade) {
      reasons.push(analysis.reason);
    }

    return {
      approved: reasons.length === 0,
      reasons,
      analysis,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 單例
export const riskManager = new RiskManager();
