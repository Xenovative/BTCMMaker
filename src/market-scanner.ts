/**
 * 市場掃描器 - 找出所有可用的 Up/Down 類型市場
 */
import axios from 'axios';

const GAMMA_HOST = 'https://gamma-api.polymarket.com';

interface MarketInfo {
  eventTitle: string;
  eventSlug: string;
  marketQuestion: string;
  outcomes: string[];
  prices: number[];
  tokenIds: string[];
  startDate: string;
  endDate: string;
  active: boolean;
  acceptingOrders: boolean;
}

async function scanMarkets() {
  console.log('🔍 Scanning for Up/Down markets on Polymarket...\n');

  try {
    // 獲取所有活躍事件
    const response = await axios.get(`${GAMMA_HOST}/events`, {
      params: {
        active: true,
        closed: false,
        limit: 500,
      },
    });

    const events = response.data;
    const upDownMarkets: MarketInfo[] = [];

    for (const event of events) {
      // 檢查標題或 slug 是否包含 up/down 相關關鍵字
      const titleLower = (event.title || '').toLowerCase();
      const slugLower = (event.slug || '').toLowerCase();

      const isUpDown =
        titleLower.includes('up or down') ||
        titleLower.includes('up/down') ||
        slugLower.includes('updown') ||
        slugLower.includes('up-down') ||
        slugLower.includes('up-or-down');

      if (isUpDown && event.markets && event.markets.length > 0) {
        const market = event.markets[0];
        try {
          const outcomes = JSON.parse(market.outcomes || '[]');
          const prices = JSON.parse(market.outcomePrices || '[]').map(Number);
          const tokenIds = JSON.parse(market.clobTokenIds || '[]');

          upDownMarkets.push({
            eventTitle: event.title,
            eventSlug: event.slug,
            marketQuestion: market.question,
            outcomes,
            prices,
            tokenIds,
            startDate: market.startDate,
            endDate: market.endDate,
            active: market.active,
            acceptingOrders: market.acceptingOrders,
          });
        } catch (e) {
          // 解析錯誤，跳過
        }
      }
    }

    if (upDownMarkets.length === 0) {
      console.log('❌ No Up/Down markets found.\n');
      console.log('Searching for crypto-related markets instead...\n');

      // 搜尋加密貨幣相關市場
      const cryptoMarkets = events.filter((e: any) => {
        const title = (e.title || '').toLowerCase();
        return (
          title.includes('bitcoin') ||
          title.includes('btc') ||
          title.includes('ethereum') ||
          title.includes('eth') ||
          title.includes('crypto')
        );
      });

      console.log(`Found ${cryptoMarkets.length} crypto-related markets:\n`);
      for (const market of cryptoMarkets.slice(0, 10)) {
        console.log(`- ${market.title}`);
        console.log(`  Slug: ${market.slug}`);
        if (market.markets && market.markets[0]) {
          const m = market.markets[0];
          console.log(`  Prices: ${m.outcomePrices}`);
        }
        console.log('');
      }
    } else {
      console.log(`✅ Found ${upDownMarkets.length} Up/Down markets:\n`);

      for (const market of upDownMarkets) {
        console.log(`📊 ${market.eventTitle}`);
        console.log(`   Slug: ${market.eventSlug}`);
        console.log(`   Outcomes: ${market.outcomes.join(' / ')}`);
        console.log(`   Prices: ${market.prices.map((p) => (p * 100).toFixed(1) + '¢').join(' / ')}`);
        console.log(`   Accepting Orders: ${market.acceptingOrders}`);
        console.log(`   Start: ${market.startDate}`);
        console.log(`   End: ${market.endDate}`);
        console.log('');
      }
    }

    // 搜尋 series
    console.log('\n📚 Searching for Up/Down series...\n');
    const seriesResponse = await axios.get(`${GAMMA_HOST}/series`, {
      params: { limit: 200 },
    });

    const upDownSeries = seriesResponse.data.filter((s: any) => {
      const title = (s.title || '').toLowerCase();
      const slug = (s.slug || '').toLowerCase();
      return (
        title.includes('up') ||
        title.includes('down') ||
        slug.includes('updown') ||
        slug.includes('up-down')
      );
    });

    if (upDownSeries.length > 0) {
      console.log(`Found ${upDownSeries.length} Up/Down series:\n`);
      for (const series of upDownSeries) {
        console.log(`- ${series.title} (${series.slug})`);
      }
    }

  } catch (error: any) {
    console.error('❌ Error scanning markets:', error.message);
  }
}

scanMarkets();
