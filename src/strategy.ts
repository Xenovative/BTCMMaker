import { config } from './config.js';
import { riskManager } from './risk-manager.js';
import type { MarketState, TradeSignal, Position } from './types.js';

/**
 * 盤前套利策略 (包含風控)
 * 
 * 核心邏輯：
 * 1. 只在盤前（下一局開始前）買入價格 < 50¢ 的 Up 或 Down
 * 2. 當價格上升 >= 2¢ 時立即賣出獲利
 * 3. 開局時必須清倉所有持倉
 * 4. 分析當前進行中的盤口走勢來預測下一局盤前價格波動
 * 
 * 風控：
 * - 滑點保護: 檢查訂單簿深度
 * - 手續費計算: 確保淨利潤 > 0
 * - 時間窗口: 開盤前 60秒強制清倉
 */
export class Strategy {
  private lastPrices: Map<string, number[]> = new Map();
  private readonly PRICE_HISTORY_LENGTH = 60;
  private minProfitableMove: number = 0; // 考慮手續費後的最小獲利價格變動

  /**
   * 分析當前盤口走勢
   * 返回預測的下一局有利方向
   */
  analyzeCurrentMarketTrend(state: MarketState): 'Up' | 'Down' | null {
    if (!state.currentMarket) return null;

    // 簡單策略：如果當前盤口 Up 價格高，下一局盤前可能 Up 會先漲
    // 這是基於市場慣性的假設
    const upPrice = state.upPrice;
    const downPrice = state.downPrice;

    if (upPrice > 55) return 'Up'; // 當前看漲，盤前可能延續
    if (downPrice > 55) return 'Down';

    return null; // 無明顯趨勢
  }

  /**
   * 計算價格動量
   */
  calculateMomentum(tokenId: string, currentPrice: number): number {
    const history = this.lastPrices.get(tokenId) || [];
    
    if (history.length < 5) {
      this.updatePriceHistory(tokenId, currentPrice);
      return 0;
    }

    // 計算短期動量 (最近 5 個價格點)
    const recentPrices = history.slice(-5);
    const avgRecent = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const momentum = currentPrice - avgRecent;

    this.updatePriceHistory(tokenId, currentPrice);
    return momentum;
  }

  private updatePriceHistory(tokenId: string, price: number): void {
    const history = this.lastPrices.get(tokenId) || [];
    history.push(price);
    if (history.length > this.PRICE_HISTORY_LENGTH) {
      history.shift();
    }
    this.lastPrices.set(tokenId, history);
  }

  /**
   * 生成交易信號
   */
  generateSignals(
    state: MarketState,
    positions: Map<string, Position>
  ): TradeSignal[] {
    const signals: TradeSignal[] = [];
    const now = Date.now();

    // 情況 0: 檢測並清倉已結束市場的持倉（orphaned positions）
    const validTokenIds = new Set([
      state.upTokenId,
      state.downTokenId,
      state.currentUpTokenId,
      state.currentDownTokenId,
    ].filter(id => id)); // 過濾空字串
    
    for (const [tokenId, position] of positions) {
      if (position.size > 0 && !validTokenIds.has(tokenId)) {
        console.log(`[策略] 發現已結束市場的持倉: ${position.outcome} ${position.size} 股，強制清倉`);
        signals.push({
          action: 'SELL',
          tokenId,
          outcome: position.outcome,
          price: position.currentPrice,
          size: position.size,
          reason: `清倉已結束市場持倉`,
        });
      }
    }
    
    if (signals.length > 0) {
      return signals;
    }

    // 情況 1a: 下一個市場開局前強制清倉
    if (state.nextMarket && state.timeToStart <= config.SELL_BEFORE_START_MS) {
      for (const [tokenId, position] of positions) {
        if (position.size > 0) {
          signals.push({
            action: 'SELL',
            tokenId,
            outcome: position.outcome,
            price: position.currentPrice,
            size: position.size,
            reason: `開局清倉 (距離開盤 ${Math.round(state.timeToStart / 1000)}s)`,
          });
        }
      }
      return signals;
    }

    // 情況 1b: 當前市場即將結束時強制清倉（防止持倉到結算）
    if (state.currentMarket && state.timeToEnd > 0 && state.timeToEnd <= config.SELL_BEFORE_START_MS) {
      for (const [tokenId, position] of positions) {
        if (position.size > 0) {
          signals.push({
            action: 'SELL',
            tokenId,
            outcome: position.outcome,
            price: position.currentPrice,
            size: position.size,
            reason: `開局清倉 (當前市場剩餘 ${Math.round(state.timeToEnd / 1000)}s)`,
          });
        }
      }
      return signals;
    }

    // 情況 2: 獲利賣出 - 當價格達到目標時主動賣出
    for (const [tokenId, position] of positions) {
      if (position.size > 0) {
        const profit = position.currentPrice - position.avgBuyPrice;
        if (profit >= config.PROFIT_TARGET) {
          console.log(`[策略] 達到獲利目標: ${position.outcome} profit=${profit.toFixed(2)}¢ >= target=${config.PROFIT_TARGET}¢`);
          signals.push({
            action: 'SELL',
            tokenId,
            outcome: position.outcome,
            price: position.currentPrice,
            size: position.size,
            reason: `獲利賣出 @ ${position.currentPrice.toFixed(1)}¢ (profit: ${profit.toFixed(2)}¢)`,
          });
        }
      }
    }
    
    // 如果有獲利賣出信號，先處理賣出
    if (signals.length > 0) {
      return signals;
    }

    // 情況 3: 盤前買入機會 (檢查時間窗口)
    const timeCheck = riskManager.checkTimeWindow(state.timeToStart);
    console.log(`[策略] 時間檢查: canTrade=${timeCheck.canTrade}, reason=${timeCheck.reason}, timeToStart=${state.timeToStart}ms`);
    
    if (!timeCheck.canTrade) {
      return signals;
    }

    // 情況 4a: 盤前買入（下一個市場）
    if (state.nextMarket && state.timeToStart > config.MIN_TIME_TO_TRADE_MS) {
      const signal = this.tryBuyMarket(state, positions, state.upTokenId, state.downTokenId, state.upPrice, state.downPrice, '盤前');
      if (signal) {
        signals.push(signal);
        return signals;
      }
    }
    
    // 情況 4b: 盤中低吸（當前市場）- 市場進行中且距離結束還有足夠時間
    if (state.currentMarket && state.timeToEnd > config.SELL_BEFORE_START_MS + 60000) { // 至少比清倉時間多 1 分鐘
      const signal = this.tryBuyMarket(state, positions, state.currentUpTokenId, state.currentDownTokenId, state.currentUpPrice, state.currentDownPrice, '盤中低吸');
      if (signal) {
        signals.push(signal);
        return signals;
      }
    }

    return signals;
  }

  /**
   * 嘗試在指定市場買入
   */
  private tryBuyMarket(
    state: MarketState,
    positions: Map<string, Position>,
    upTokenId: string,
    downTokenId: string,
    upPrice: number,
    downPrice: number,
    label: string
  ): TradeSignal | null {
    if (!upTokenId || !downTokenId) return null;
    
    const trend = this.analyzeCurrentMarketTrend(state);

    // 計算考慮手續費後的最小獲利價格變動
    const minMove = riskManager.calculateMinPriceMove(
      upPrice,
      config.PROFIT_TARGET,
      config.MAX_POSITION_SIZE
    );
    this.minProfitableMove = minMove;

    console.log(`[策略] ${label}買入條件檢查: trend=${trend}, minMove=${minMove.toFixed(2)}¢`);
    console.log(`[策略] Up: price=${upPrice.toFixed(1)}¢, hasPosition=${positions.has(upTokenId)}`);
    console.log(`[策略] Down: price=${downPrice.toFixed(1)}¢, hasPosition=${positions.has(downTokenId)}`);

    // 檢查是否已有該市場的持倉 - 每個市場只買一次
    const hasPositionInThisMarket = positions.has(upTokenId) || positions.has(downTokenId);
    if (hasPositionInThisMarket) {
      console.log(`[策略] 已有該市場持倉，不再買入`);
      return null;
    }

    // 檢查 Up
    if (upPrice < config.MAX_BUY_PRICE) {
      const upMomentum = this.calculateMomentum(upTokenId, upPrice);
      return {
        action: 'BUY',
        tokenId: upTokenId,
        outcome: 'Up',
        price: upPrice,
        size: config.MAX_POSITION_SIZE,
        reason: `${label}買入 Up @ ${upPrice.toFixed(1)}¢ (trend: ${trend || 'none'}, momentum: ${upMomentum.toFixed(2)})`,
      };
    }

    // 如果 Up 價格太高，檢查 Down
    if (downPrice < config.MAX_BUY_PRICE) {
      const downMomentum = this.calculateMomentum(downTokenId, downPrice);
      return {
        action: 'BUY',
        tokenId: downTokenId,
        outcome: 'Down',
        price: downPrice,
        size: config.MAX_POSITION_SIZE,
        reason: `${label}買入 Down @ ${downPrice.toFixed(1)}¢ (trend: ${trend || 'none'}, momentum: ${downMomentum.toFixed(2)})`,
      };
    }

    return null;
  }

  /**
   * 更新持倉的當前價格
   */
  updatePositionPrices(
    positions: Map<string, Position>,
    state: MarketState
  ): void {
    for (const [tokenId, position] of positions) {
      if (tokenId === state.upTokenId) {
        position.currentPrice = state.upPrice;
      } else if (tokenId === state.downTokenId) {
        position.currentPrice = state.downPrice;
      } else if (tokenId === state.currentUpTokenId) {
        position.currentPrice = state.currentUpPrice;
      } else if (tokenId === state.currentDownTokenId) {
        position.currentPrice = state.currentDownPrice;
      }
    }
  }
}
