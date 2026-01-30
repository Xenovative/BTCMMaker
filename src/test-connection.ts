/**
 * 測試腳本 - 驗證 API 連接和市場獲取
 */
import axios from 'axios';

const GAMMA_HOST = 'https://gamma-api.polymarket.com';

async function testConnection() {
  console.log('🔍 Testing Polymarket API connection...\n');

  try {
    // 測試 1: 獲取活躍事件
    console.log('1. Fetching active events...');
    const eventsRes = await axios.get(`${GAMMA_HOST}/events`, {
      params: {
        active: true,
        closed: false,
        limit: 5,
      },
    });
    console.log(`   ✅ Found ${eventsRes.data.length} events`);

    // 測試 2: 搜尋 BTC 15min 市場
    console.log('\n2. Searching for BTC 15min markets...');
    const btcRes = await axios.get(`${GAMMA_HOST}/events`, {
      params: {
        slug_contains: 'btc-updown',
        active: true,
        limit: 10,
      },
    });

    if (btcRes.data.length > 0) {
      console.log(`   ✅ Found ${btcRes.data.length} BTC markets`);
      for (const event of btcRes.data.slice(0, 3)) {
        console.log(`   - ${event.title || event.slug}`);
        if (event.markets && event.markets.length > 0) {
          const market = event.markets[0];
          console.log(`     Token IDs: ${market.clobTokenIds}`);
          console.log(`     Prices: ${market.outcomePrices}`);
        }
      }
    } else {
      console.log('   ⚠️ No BTC 15min markets found via slug search');
      console.log('   Trying series endpoint...');

      const seriesRes = await axios.get(`${GAMMA_HOST}/series`, {
        params: { slug: 'btc-updown-15m' },
      });
      console.log('   Series response:', JSON.stringify(seriesRes.data, null, 2).slice(0, 500));
    }

    // 測試 3: 獲取訂單簿
    console.log('\n3. Testing CLOB API...');
    const clobRes = await axios.get('https://clob.polymarket.com/');
    console.log(`   ✅ CLOB API reachable: ${clobRes.status}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data).slice(0, 200));
    }
  }
}

testConnection();
