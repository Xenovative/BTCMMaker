import { config, validateConfig } from './config.js';
import { MarketFetcher } from './market-fetcher.js';
import { Trader } from './trader.js';
import { Strategy } from './strategy.js';

class TradingBot {
  private fetcher: MarketFetcher;
  private trader: Trader;
  private strategy: Strategy;
  private isRunning = false;

  constructor() {
    this.fetcher = new MarketFetcher();
    this.trader = new Trader();
    this.strategy = new Strategy();
  }

  async start(): Promise<void> {
    console.log('🚀 Starting Polymarket BTC 15min Trading Bot');
    console.log(`📊 Config: MAX_BUY_PRICE=${config.MAX_BUY_PRICE}¢, PROFIT_TARGET=${config.PROFIT_TARGET}¢`);
    console.log(`📊 Paper Trading: ${config.PAPER_TRADING}`);

    validateConfig();
    await this.trader.initialize();

    this.isRunning = true;
    await this.runLoop();
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.tick();
      } catch (error) {
        console.error('❌ Error in main loop:', error);
      }

      await this.sleep(config.POLL_INTERVAL_MS);
    }
  }

  private async tick(): Promise<void> {
    // 1. 獲取市場狀態
    const state = await this.fetcher.getMarketState();

    if (!state) {
      console.log('⏳ Waiting for active market...');
      return;
    }

    // 2. 更新持倉價格
    const positions = this.trader.getPositions();
    this.strategy.updatePositionPrices(positions, state);

    // 3. 顯示狀態
    this.logStatus(state);

    // 4. 生成交易信號
    const signals = this.strategy.generateSignals(state, positions);

    // 5. 執行交易
    for (const signal of signals) {
      console.log(`📍 Signal: ${signal.action} ${signal.outcome} - ${signal.reason}`);

      if (signal.action === 'BUY') {
        await this.trader.buy(
          signal.tokenId,
          signal.outcome,
          signal.price,
          signal.size
        );
      } else if (signal.action === 'SELL') {
        await this.trader.sell(
          signal.tokenId,
          signal.outcome,
          signal.price,
          signal.size
        );
      }
    }
  }

  private logStatus(state: any): void {
    const positions = this.trader.getPositions();
    const totalPnL = this.trader.getTotalPnL();

    const timeToStartSec = Math.floor(state.timeToStart / 1000);
    const timeToEndSec = Math.floor(state.timeToEnd / 1000);

    let statusLine = `Up: ${state.upPrice.toFixed(1)}¢ | Down: ${state.downPrice.toFixed(1)}¢`;

    if (state.nextMarket && state.timeToStart > 0) {
      statusLine += ` | 開局倒數: ${timeToStartSec}s`;
    }
    if (state.currentMarket && state.timeToEnd > 0) {
      statusLine += ` | 結束倒數: ${timeToEndSec}s`;
    }

    statusLine += ` | 持倉: ${positions.size} | 累計PnL: ${totalPnL.toFixed(2)}¢`;

    console.log(`📈 ${statusLine}`);

    // 顯示持倉詳情
    for (const [, pos] of positions) {
      const unrealizedPnL = (pos.currentPrice - pos.avgBuyPrice) * pos.size;
      console.log(
        `   └─ ${pos.outcome}: ${pos.size} @ ${pos.avgBuyPrice.toFixed(1)}¢ → ${pos.currentPrice.toFixed(1)}¢ (${unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toFixed(2)}¢)`
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  stop(): void {
    console.log('🛑 Stopping bot...');
    this.isRunning = false;
  }
}

// 主程序入口
const bot = new TradingBot();

process.on('SIGINT', () => {
  bot.stop();
  console.log('\n📊 Final Stats:');
  process.exit(0);
});

bot.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
