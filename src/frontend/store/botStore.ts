import { create } from 'zustand';

export interface BotConfig {
  paperTrade: boolean;
  maxBuyPrice: number;
  profitTarget: number;
  stopLoss: number;
  maxPositionSize: number;
  allowCurrentMarketTrading: boolean;
  privateKey: string;
  funderAddress: string;
}

export interface Position {
  tokenId: string;
  outcome: 'Up' | 'Down';
  size: number;
  avgBuyPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

export interface Trade {
  id: string;
  timestamp: number;
  market: string;
  outcome: 'Up' | 'Down';
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  pnl?: number;
  pnlPercent?: number;
}

export interface MarketState {
  currentMarket: string | null;
  nextMarket: string | null;
  upPrice: number;
  downPrice: number;
  timeToStart: number;
  timeToEnd: number;
}

export interface BotStatus {
  running: boolean;
  connected: boolean;
  paperTrade: boolean;
  totalPnl: number;
  totalTrades: number;
  winRate: number;
}

interface BotStore {
  config: BotConfig;
  status: BotStatus;
  positions: Position[];
  trades: Trade[];
  market: MarketState | null;
  ws: WebSocket | null;
  
  connect: () => void;
  disconnect: () => void;
  updateConfig: (config: Partial<BotConfig>) => void;
  startBot: () => void;
  stopBot: () => void;
}

export const useBotStore = create<BotStore>((set, get) => ({
  config: {
    paperTrade: true,
    maxBuyPrice: 50,
    profitTarget: 2,
    stopLoss: 5,
    maxPositionSize: 100,
    allowCurrentMarketTrading: true,
    privateKey: '',
    funderAddress: '',
  },
  status: {
    running: false,
    connected: false,
    paperTrade: true,
    totalPnl: 0,
    totalTrades: 0,
    winRate: 0,
  },
  positions: [],
  trades: [],
  market: null,
  ws: null,

  connect: () => {
    const ws = new WebSocket(`ws://${window.location.hostname}:3001/ws`);
    
    ws.onopen = () => {
      console.log('[WS] Connected');
      set({ ws, status: { ...get().status, connected: true } });
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      set({ ws: null, status: { ...get().status, connected: false } });
      // Reconnect after 3 seconds
      setTimeout(() => get().connect(), 3000);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type, data } = message;

        switch (type) {
          case 'status':
            set({ status: { ...get().status, ...data } });
            break;
          case 'config':
            set({ config: { ...get().config, ...data } });
            break;
          case 'market':
            set({ market: data });
            break;
          case 'positions':
            set({ positions: data });
            break;
          case 'trade':
            set({ trades: [data, ...get().trades].slice(0, 100) });
            break;
          case 'trades':
            set({ trades: data });
            break;
          case 'pnl':
            set({ status: { ...get().status, totalPnl: data.totalPnl, totalTrades: data.totalTrades, winRate: data.winRate } });
            break;
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null });
    }
  },

  updateConfig: (newConfig) => {
    const { ws, config } = get();
    const updated = { ...config, ...newConfig };
    set({ config: updated });
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'config', data: updated }));
    }
  },

  startBot: () => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'start' }));
    }
  },

  stopBot: () => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }));
    }
  },
}));
