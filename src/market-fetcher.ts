import axios from 'axios';
import { config } from './config.js';
import type { Market, MarketState } from './types.js';

const GAMMA_API_URL = 'https://gamma-api.polymarket.com';
const CLOB_HTTP_URL = 'https://clob.polymarket.com';

export class MarketFetcher {
  private serverTimeOffset: number = 0;

  /**
   * 同步服務器時間
   */
  async syncServerTime(): Promise<void> {
    try {
      const response = await axios.get(`${CLOB_HTTP_URL}/time`);
      if (response.data?.time) {
        this.serverTimeOffset = response.data.time * 1000 - Date.now();
        console.log(`[市場] 服務器時間已同步，偏移: ${this.serverTimeOffset}ms`);
      }
    } catch (err) {
      console.error('[市場] 無法同步服務器時間');
    }
  }

  getServerTime(): number {
    return Date.now() + this.serverTimeOffset;
  }

  /**
   * 獲取即將來臨的 BTC 15分鐘市場
   * 使用 slug 格式: btc-updown-15m-{unix_timestamp}
   */
  async fetchUpcomingBTC15MinMarkets(): Promise<Market[]> {
    const now = this.getServerTime();
    const markets: Market[] = [];

    // 嘗試獲取過去和接下來幾個 15 分鐘區間的市場（擴大範圍以捕捉所有持倉）
    for (let i = -4; i < 5; i++) {
      const baseTime = i < 0 ? now : now + i * 15 * 60 * 1000;
      const intervalStart = Math.floor(baseTime / (15 * 60 * 1000)) * (15 * 60 * 1000);
      const timestamp = Math.floor(intervalStart / 1000);
      const slug = `btc-updown-15m-${timestamp}`;

      try {
        const response = await axios.get(`${GAMMA_API_URL}/events`, {
          params: { slug },
        });

        if (Array.isArray(response.data) && response.data.length > 0) {
          const event = response.data[0];
          const market = this.parseEventToMarket(event);
          if (market && !market.closed) {
            markets.push(market);
          }
        }
      } catch (e) {
        // 市場不存在，繼續
      }
    }

    // 也嘗試從 tag 獲取
    try {
      const response = await axios.get(`${GAMMA_API_URL}/events`, {
        params: {
          tag: '15M',
          active: true,
          closed: false,
          limit: 20,
        },
      });

      if (Array.isArray(response.data)) {
        for (const event of response.data) {
          if (event.slug?.startsWith('btc-updown-15m-')) {
            const market = this.parseEventToMarket(event);
            if (market && !market.closed && !markets.find(m => m.conditionId === market.conditionId)) {
              markets.push(market);
            }
          }
        }
      }
    } catch (e) {
      // 忽略
    }

    // 按開始時間排序
    return markets.sort((a, b) =>
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
  }

  /**
   * 解析事件為市場物件
   */
  private parseEventToMarket(event: any): Market | null {
    if (!event || !event.markets || event.markets.length === 0) return null;

    const market = event.markets[0];
    const clobTokenIds = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : [];
    const outcomes = market.outcomes ? JSON.parse(market.outcomes) : ['Up', 'Down'];
    const outcomePrices = market.outcomePrices ? JSON.parse(market.outcomePrices) : ['0.5', '0.5'];

    const startTime = event.startTime || market.eventStartTime || market.startDate;
    const endTime = event.endDate || market.endDate;

    return {
      conditionId: market.conditionId,
      questionId: market.questionID,
      slug: event.slug || market.slug,
      question: market.question || event.title,
      startDate: startTime,
      endDate: endTime,
      tokens: clobTokenIds.map((tokenId: string, idx: number) => ({
        tokenId,
        outcome: outcomes[idx] === 'Up' ? 'Up' : 'Down',
        price: parseFloat(outcomePrices[idx]) || 0.5,
      })),
      active: market.active !== false && event.active !== false,
      closed: market.closed === true || event.closed === true,
      acceptingOrders: market.acceptingOrders,
    };
  }

  /**
   * 獲取當前市場狀態
   */
  async getMarketState(): Promise<MarketState | null> {
    const markets = await this.fetchUpcomingBTC15MinMarkets();

    if (markets.length === 0) {
      console.log('[市場] 找不到活躍的 BTC 15分鐘市場');
      return null;
    }

    const now = this.getServerTime();
    let currentMarket: Market | null = null;
    let nextMarket: Market | null = null;

    for (const market of markets) {
      const startTime = new Date(market.startDate).getTime();
      const endTime = new Date(market.endDate).getTime();

      if (now >= startTime && now < endTime) {
        currentMarket = market;
      } else if (now < startTime && (!nextMarket || startTime < new Date(nextMarket.startDate).getTime())) {
        nextMarket = market;
      }
    }

    if (!currentMarket && !nextMarket) {
      return null;
    }

    const targetMarket = nextMarket || currentMarket!;
    const upToken = targetMarket.tokens.find(t => t.outcome === 'Up');
    const downToken = targetMarket.tokens.find(t => t.outcome === 'Down');

    // 也獲取當前市場的 tokenId（用於同步持倉）
    const currentUpToken = currentMarket?.tokens.find(t => t.outcome === 'Up');
    const currentDownToken = currentMarket?.tokens.find(t => t.outcome === 'Down');

    return {
      currentMarket,
      nextMarket,
      allMarkets: markets, // 所有已獲取的市場
      upPrice: (upToken?.price || 0.5) * 100,
      downPrice: (downToken?.price || 0.5) * 100,
      upTokenId: upToken?.tokenId || '',
      downTokenId: downToken?.tokenId || '',
      // 當前市場的 tokenId（用於同步持倉和強制清倉）
      currentUpTokenId: currentUpToken?.tokenId || '',
      currentDownTokenId: currentDownToken?.tokenId || '',
      currentUpPrice: (currentUpToken?.price || 0.5) * 100,
      currentDownPrice: (currentDownToken?.price || 0.5) * 100,
      timeToStart: nextMarket ? new Date(nextMarket.startDate).getTime() - now : 0,
      timeToEnd: currentMarket ? new Date(currentMarket.endDate).getTime() - now : 0,
    };
  }

  /**
   * 獲取特定 token 的訂單簿
   */
  async getOrderBook(tokenId: string): Promise<{ bids: any[]; asks: any[] }> {
    try {
      const response = await axios.get(`${CLOB_HTTP_URL}/book`, {
        params: { token_id: tokenId },
      });
      return response.data || { bids: [], asks: [] };
    } catch (error) {
      console.error('[市場] 獲取訂單簿失敗:', error);
      return { bids: [], asks: [] };
    }
  }
}
