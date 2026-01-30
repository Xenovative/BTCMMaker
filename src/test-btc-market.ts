/**
 * 測試 BTC 15min 市場獲取
 */
import { MarketFetcher } from './market-fetcher.js';

async function test() {
  console.log('🔍 測試 BTC 15min 市場獲取...\n');

  const fetcher = new MarketFetcher();
  
  // 同步服務器時間
  await fetcher.syncServerTime();
  
  // 獲取市場
  console.log('\n📊 獲取即將來臨的 BTC 15min 市場...');
  const markets = await fetcher.fetchUpcomingBTC15MinMarkets();
  
  if (markets.length === 0) {
    console.log('❌ 找不到 BTC 15min 市場');
    return;
  }
  
  console.log(`✅ 找到 ${markets.length} 個市場:\n`);
  
  for (const market of markets) {
    const startTime = new Date(market.startDate);
    const endTime = new Date(market.endDate);
    const now = fetcher.getServerTime();
    const timeToStart = startTime.getTime() - now;
    
    console.log(`📈 ${market.question}`);
    console.log(`   Slug: ${market.slug}`);
    console.log(`   開始: ${startTime.toLocaleString()}`);
    console.log(`   結束: ${endTime.toLocaleString()}`);
    console.log(`   距離開始: ${Math.round(timeToStart / 1000)}s`);
    
    for (const token of market.tokens) {
      console.log(`   ${token.outcome}: ${(token.price * 100).toFixed(1)}¢ (${token.tokenId.slice(0, 20)}...)`);
    }
    console.log('');
  }
  
  // 測試市場狀態
  console.log('\n📊 獲取市場狀態...');
  const state = await fetcher.getMarketState();
  
  if (state) {
    console.log(`\n當前市場: ${state.currentMarket?.question || '無'}`);
    console.log(`下一市場: ${state.nextMarket?.question || '無'}`);
    console.log(`Up 價格: ${state.upPrice.toFixed(1)}¢`);
    console.log(`Down 價格: ${state.downPrice.toFixed(1)}¢`);
    console.log(`距離開始: ${Math.round(state.timeToStart / 1000)}s`);
    console.log(`距離結束: ${Math.round(state.timeToEnd / 1000)}s`);
  }
}

test().catch(console.error);
