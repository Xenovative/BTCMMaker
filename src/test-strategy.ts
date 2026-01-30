import { MarketFetcher } from './market-fetcher.js';
import { Strategy } from './strategy.js';
import { config } from './config.js';

async function testStrategy() {
  console.log('=== 策略測試 ===\n');
  
  const fetcher = new MarketFetcher();
  const strategy = new Strategy();
  
  // 同步時間
  await fetcher.syncServerTime();
  
  // 獲取市場狀態
  const state = await fetcher.getMarketState();
  
  if (!state) {
    console.log('❌ 無法獲取市場狀態');
    return;
  }
  
  console.log('📊 市場狀態:');
  console.log(`  當前市場: ${state.currentMarket?.question || 'N/A'}`);
  console.log(`  下一市場: ${state.nextMarket?.question || 'N/A'}`);
  console.log(`  Up 價格: ${state.upPrice.toFixed(1)}¢`);
  console.log(`  Down 價格: ${state.downPrice.toFixed(1)}¢`);
  console.log(`  距離開盤: ${Math.round(state.timeToStart / 1000)}s`);
  console.log(`  距離結束: ${Math.round(state.timeToEnd / 1000)}s`);
  console.log(`  Up Token: ${state.upTokenId}`);
  console.log(`  Down Token: ${state.downTokenId}`);
  console.log('');
  
  console.log('⚙️ 配置:');
  console.log(`  MAX_BUY_PRICE: ${config.MAX_BUY_PRICE}¢`);
  console.log(`  MIN_TIME_TO_TRADE_MS: ${config.MIN_TIME_TO_TRADE_MS}ms`);
  console.log(`  SELL_BEFORE_START_MS: ${config.SELL_BEFORE_START_MS}ms`);
  console.log('');
  
  // 生成信號
  const positions = new Map();
  console.log('🔍 生成交易信號...\n');
  
  const signals = strategy.generateSignals(state, positions);
  
  console.log('\n📍 信號結果:');
  if (signals.length === 0) {
    console.log('  (無信號)');
  } else {
    for (const signal of signals) {
      console.log(`  ${signal.action} ${signal.outcome} @ ${signal.price.toFixed(1)}¢ x ${signal.size}`);
      console.log(`    原因: ${signal.reason}`);
    }
  }
}

testStrategy().catch(console.error);
