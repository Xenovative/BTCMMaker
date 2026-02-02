import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Polymarket API
  CLOB_HOST: 'https://clob.polymarket.com',
  GAMMA_HOST: 'https://gamma-api.polymarket.com',
  CHAIN_ID: 137, // Polygon mainnet

  // Wallet
  PRIVATE_KEY: process.env.PRIVATE_KEY || '',
  FUNDER_ADDRESS: process.env.FUNDER_ADDRESS || '', // Polymarket proxy wallet address

  // Trading parameters
  MAX_BUY_PRICE: Number(process.env.MAX_BUY_PRICE) || 50, // cents
  PROFIT_TARGET: Number(process.env.PROFIT_TARGET) || 2, // cents
  STOP_LOSS: Number(process.env.STOP_LOSS) || 5, // cents - 止損點（虧損超過此值時賣出）
  MAX_POSITION_SIZE: Number(process.env.MAX_POSITION_SIZE) || 100,
  ALLOW_CURRENT_MARKET_TRADING: process.env.ALLOW_CURRENT_MARKET_TRADING !== 'false', // 是否允許盤中交易（默認開啟）
  POLL_INTERVAL_MS: Number(process.env.POLL_INTERVAL_MS) || 5000,
  PAPER_TRADING: process.env.PAPER_TRADING === 'true',

  // 滑點保護
  MAX_SLIPPAGE_CENTS: Number(process.env.MAX_SLIPPAGE_CENTS) || 1, // 最大允許滑點
  MIN_ORDERBOOK_DEPTH: Number(process.env.MIN_ORDERBOOK_DEPTH) || 50, // 最小訂單簿深度

  // 手續費計算 (Polymarket: maker 0%, taker ~1%)
  TAKER_FEE_PERCENT: 1, // 1%
  MAKER_FEE_PERCENT: 0, // 0%

  // API Rate Limiting
  MIN_REQUEST_INTERVAL_MS: 200, // 最小請求間隔 (5 req/sec)
  MAX_REQUESTS_PER_MINUTE: 60,

  // 時間安全邊際
  SELL_BEFORE_START_MS: 5000, // 開盤前 5 秒強制清倉
  MIN_TIME_TO_TRADE_MS: 6000, // 至少距離開盤 6 秒才能交易（比清倉時間多 1 秒）

  // Market identifiers - 可用的 Up/Down 系列
  // 'eth-up-or-down-15m' | 'eth-up-or-down-hourly' | 'solana-up-or-down-hourly' | 'spx-daily-up-or-down'
  TARGET_SERIES_SLUG: process.env.TARGET_SERIES_SLUG || 'eth-up-or-down-15m',
};

export function validateConfig(): void {
  if (!config.PRIVATE_KEY && !config.PAPER_TRADING) {
    throw new Error('PRIVATE_KEY is required for live trading');
  }
}
