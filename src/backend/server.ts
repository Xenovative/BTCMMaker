import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { MarketFetcher } from '../market-fetcher.js';
import { Trader } from '../trader.js';
import { Strategy } from '../strategy.js';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files in production
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Bot state
let botRunning = false;
let botInterval: NodeJS.Timeout | null = null;
const fetcher = new MarketFetcher();
const trader = new Trader();
const strategy = new Strategy();

// 購買鎖 - 防止同一市場重複購買
let buyingInProgress = false;
let lastBoughtMarketId: string | null = null;

// Connected clients
const clients = new Set<WebSocket>();

// Broadcast to all clients
function broadcast(type: string, data: any) {
  const message = JSON.stringify({ type, data });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Helper to add delay between API calls
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Bot tick function
async function tick() {
  try {
    const state = await fetcher.getMarketState();
    await delay(500); // Rate limit protection

    if (!state) {
      console.log('[Tick] No market state');
      broadcast('market', null);
      return;
    }
    
    console.log(`[Tick] Up: ${state.upPrice.toFixed(1)}¢, Down: ${state.downPrice.toFixed(1)}¢, timeToStart: ${Math.round(state.timeToStart/1000)}s`);

    // Broadcast market state
    broadcast('market', {
      currentMarket: state.currentMarket?.question || null,
      nextMarket: state.nextMarket?.question || null,
      upPrice: state.upPrice,
      downPrice: state.downPrice,
      timeToStart: state.timeToStart,
      timeToEnd: state.timeToEnd,
    });

    // 從 API 同步持倉（只同步當前和下一個市場，避免 rate limit）
    await trader.syncPositionsFromApi(state.upTokenId, state.downTokenId, state.upPrice, state.downPrice);
    await delay(300);
    if (state.currentUpTokenId && state.currentDownTokenId) {
      await trader.syncPositionsFromApi(state.currentUpTokenId, state.currentDownTokenId, state.currentUpPrice, state.currentDownPrice);
      await delay(300);
    }

    // Update position prices
    const positions = trader.getPositions();
    strategy.updatePositionPrices(positions, state);

    // Broadcast positions
    const positionsArray = Array.from(positions.values()).map((pos) => ({
      tokenId: pos.tokenId,
      outcome: pos.outcome,
      size: pos.size,
      avgBuyPrice: pos.avgBuyPrice,
      currentPrice: pos.currentPrice,
      unrealizedPnl: (pos.currentPrice - pos.avgBuyPrice) * pos.size,
    }));
    broadcast('positions', positionsArray);

    // 當前市場 ID
    const marketId = state.nextMarket?.conditionId || state.currentMarket?.conditionId || '';
    
    // 如果市場改變了，重置購買鎖
    if (lastBoughtMarketId && lastBoughtMarketId !== marketId) {
      console.log(`[重置] 市場已改變，允許新購買`);
      lastBoughtMarketId = null;
    }

    // 檢查現有持倉是否需要補掛 Limit Sell 或清理剩餘
    for (const [tokenId, pos] of positions) {
      if (pos.size > 0 && !config.PAPER_TRADING) {
        // 先嘗試補掛 Limit Sell
        await trader.placeLimitSellForPosition(tokenId, pos.outcome, pos.avgBuyPrice);
        await delay(300);
        // 清理剩餘小數股份（< 1 股）
        await trader.marketSellRemainder(tokenId, pos.outcome, pos.currentPrice);
        await delay(300);
      }
    }

    // Generate and execute signals
    const signals = strategy.generateSignals(state, positions);

    for (const signal of signals) {
      console.log(`📍 Signal: ${signal.action} ${signal.outcome} - ${signal.reason}`);

      let success = false;
      if (signal.action === 'BUY') {
        // 防止重複購買: 檢查鎖和市場 ID
        if (buyingInProgress) {
          console.log(`[跳過] 購買中，等待上一筆完成`);
          continue;
        }
        if (lastBoughtMarketId === marketId) {
          console.log(`[跳過] 已在此市場購買過`);
          continue;
        }

        buyingInProgress = true;
        try {
          success = await trader.buy(signal.tokenId, signal.outcome, signal.price, signal.size);
          if (success) {
            lastBoughtMarketId = marketId;
            console.log(`[鎖定] 已記錄市場: ${marketId.slice(0, 20)}...`);
          }
        } finally {
          buyingInProgress = false;
        }
      } else if (signal.action === 'SELL') {
        // 檢查是否是強制清倉（開局前）
        if (signal.reason?.includes('開局清倉')) {
          success = await trader.forceLiquidate(signal.tokenId, signal.outcome, signal.price);
        } else {
          success = await trader.sell(signal.tokenId, signal.outcome, signal.price, signal.size);
        }
        // 賣出後重置市場鎖，允許下一次購買
        if (success) {
          lastBoughtMarketId = null;
        }
      }

      await delay(500); // Rate limit between trades
      if (success) {
        // Broadcast trade
        broadcast('trade', {
          id: Date.now().toString(),
          timestamp: Date.now(),
          market: state.nextMarket?.question || state.currentMarket?.question || 'Unknown',
          outcome: signal.outcome,
          side: signal.action,
          price: signal.price,
          size: signal.size,
          pnl: signal.action === 'SELL' ? (signal.price - (positions.get(signal.tokenId)?.avgBuyPrice || signal.price)) * signal.size : undefined,
        });
      }
    }

    // Broadcast PnL stats
    const history = trader.getTradeHistory();
    const totalPnl = history.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const wins = history.filter((t) => (t.pnl || 0) > 0).length;
    const totalTrades = history.filter((t) => t.side === 'SELL').length;

    broadcast('pnl', {
      totalPnl,
      totalTrades,
      winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
    });
  } catch (error) {
    console.error('[Bot] Tick error:', error);
  }
}

// Start bot
async function startBot() {
  if (botRunning) return;

  console.log('🚀 Starting bot...');
  
  // 重置購買鎖
  lastBoughtMarketId = null;
  buyingInProgress = false;

  // Sync server time
  await fetcher.syncServerTime();

  // Initialize trader
  const initialized = await trader.initialize();
  if (!initialized && !config.PAPER_TRADING) {
    console.error('❌ Failed to initialize trader');
    return;
  }

  botRunning = true;
  botInterval = setInterval(tick, config.POLL_INTERVAL_MS);

  broadcast('status', {
    running: true,
    connected: true,
    paperTrade: config.PAPER_TRADING,
  });

  console.log('✅ Bot started');
}

// Stop bot
function stopBot() {
  if (!botRunning) return;

  console.log('🛑 Stopping bot...');

  if (botInterval) {
    clearInterval(botInterval);
    botInterval = null;
  }

  botRunning = false;

  broadcast('status', {
    running: false,
    connected: true,
    paperTrade: config.PAPER_TRADING,
  });

  console.log('✅ Bot stopped');
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  clients.add(ws);

  // Send initial state
  ws.send(
    JSON.stringify({
      type: 'status',
      data: {
        running: botRunning,
        connected: true,
        paperTrade: config.PAPER_TRADING,
        totalPnl: 0,
        totalTrades: 0,
        winRate: 0,
      },
    })
  );

  ws.send(
    JSON.stringify({
      type: 'config',
      data: {
        paperTrade: config.PAPER_TRADING,
        maxBuyPrice: config.MAX_BUY_PRICE,
        profitTarget: config.PROFIT_TARGET,
        stopLoss: config.STOP_LOSS,
        maxPositionSize: config.MAX_POSITION_SIZE,
        allowCurrentMarketTrading: config.ALLOW_CURRENT_MARKET_TRADING,
        privateKey: '',
        funderAddress: config.FUNDER_ADDRESS,
      },
    })
  );

  // Handle messages
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      const { type, data: payload } = message;

      switch (type) {
        case 'start':
          await startBot();
          break;
        case 'stop':
          stopBot();
          break;
        case 'config':
          // Update config (in memory only for security)
          if (payload.privateKey) {
            (config as any).PRIVATE_KEY = payload.privateKey;
          }
          if (payload.funderAddress) {
            (config as any).FUNDER_ADDRESS = payload.funderAddress;
          }
          if (payload.paperTrade !== undefined) {
            (config as any).PAPER_TRADING = payload.paperTrade;
          }
          if (payload.maxBuyPrice) {
            (config as any).MAX_BUY_PRICE = payload.maxBuyPrice;
          }
          if (payload.profitTarget) {
            (config as any).PROFIT_TARGET = payload.profitTarget;
          }
          if (payload.maxPositionSize) {
            (config as any).MAX_POSITION_SIZE = payload.maxPositionSize;
          }
          if (payload.stopLoss) {
            (config as any).STOP_LOSS = payload.stopLoss;
          }
          if (payload.allowCurrentMarketTrading !== undefined) {
            (config as any).ALLOW_CURRENT_MARKET_TRADING = payload.allowCurrentMarketTrading;
          }

          broadcast('status', {
            running: botRunning,
            connected: true,
            paperTrade: config.PAPER_TRADING,
          });

          console.log('[Config] Updated');
          break;
      }
    } catch (error) {
      console.error('[WS] Message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    clients.delete(ws);
  });
});

// API routes
app.get('/api/status', (req, res) => {
  res.json({
    running: botRunning,
    paperTrade: config.PAPER_TRADING,
  });
});

app.post('/api/start', async (req, res) => {
  await startBot();
  res.json({ running: botRunning });
});

app.post('/api/stop', (req, res) => {
  stopBot();
  res.json({ running: botRunning });
});

app.post('/api/config', (req, res) => {
  const payload = req.body;
  if (payload.privateKey) {
    (config as any).PRIVATE_KEY = payload.privateKey;
  }
  if (payload.funderAddress) {
    (config as any).FUNDER_ADDRESS = payload.funderAddress;
  }
  if (payload.paperTrade !== undefined) {
    (config as any).PAPER_TRADING = payload.paperTrade;
  }
  if (payload.maxBuyPrice) {
    (config as any).MAX_BUY_PRICE = payload.maxBuyPrice;
  }
  console.log('[Config] Updated via API:', { paperTrade: config.PAPER_TRADING });
  res.json({ success: true, paperTrade: config.PAPER_TRADING });
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start server
const PORT = Number(process.env.PORT) || 3002;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🚀 BTC 15M TRADING BOT SERVER                              ║
║                                                              ║
║   Backend:   http://localhost:${PORT}                          ║
║   WebSocket: ws://localhost:${PORT}/ws                         ║
║                                                              ║
║   Frontend:  Run 'npm run dev:frontend' to start             ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
});
