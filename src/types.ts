export interface MarketToken {
  tokenId: string;
  outcome: 'Up' | 'Down';
  price: number;
}

export interface Market {
  conditionId: string;
  questionId: string;
  slug: string;
  question: string;
  startDate: string;
  endDate: string;
  tokens: MarketToken[];
  active: boolean;
  closed: boolean;
  acceptingOrders?: boolean;
}

export interface Event {
  id: string;
  slug: string;
  title: string;
  startDate: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  markets: Market[];
}

export interface Position {
  tokenId: string;
  outcome: 'Up' | 'Down';
  size: number;
  avgBuyPrice: number;
  currentPrice: number;
}

export interface TradeSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  tokenId: string;
  outcome: 'Up' | 'Down';
  price: number;
  size: number;
  reason: string;
}

export interface MarketState {
  currentMarket: Market | null; // 正在進行的盤口
  nextMarket: Market | null; // 下一個盤口 (盤前交易)
  allMarkets: Market[]; // 所有已獲取的市場（用於同步持倉）
  upPrice: number;
  downPrice: number;
  upTokenId: string;
  downTokenId: string;
  // 當前市場的 tokenId（用於同步持倉和強制清倉）
  currentUpTokenId: string;
  currentDownTokenId: string;
  currentUpPrice: number;
  currentDownPrice: number;
  timeToStart: number; // ms until next market starts
  timeToEnd: number; // ms until current market ends
}

export interface OrderBook {
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
}

export interface TradeRecord {
  timestamp: Date;
  market: string;
  outcome: 'Up' | 'Down';
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  pnl?: number;
}
