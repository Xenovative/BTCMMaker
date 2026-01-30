import { ClobClient, Side } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { config } from './config.js';
import type { Position, TradeRecord } from './types.js';

const CLOB_HTTP_URL = 'https://clob.polymarket.com';
const CHAIN_ID = 137; // Polygon mainnet

export interface ApiCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export class Trader {
  private clobClient: ClobClient | null = null;
  private apiCredentials: ApiCredentials | null = null;
  private positions: Map<string, Position> = new Map();
  private tradeHistory: TradeRecord[] = [];
  private pendingSellOrders: Map<string, string> = new Map(); // tokenId -> orderId

  async initialize(): Promise<boolean> {
    if (config.PAPER_TRADING) {
      console.log('🧪 Paper trading mode - no real trades will be executed');
      return true;
    }

    if (!config.PRIVATE_KEY) {
      console.error('[交易] 未配置私鑰');
      return false;
    }

    try {
      const signer = new Wallet(config.PRIVATE_KEY);

      // 創建 L1 客戶端以獲取 API 憑證
      const l1Client = new ClobClient(CLOB_HTTP_URL, CHAIN_ID, signer);

      console.log('[交易] 正在從私鑰衍生 API 憑證...');
      const creds = await l1Client.createOrDeriveApiKey();

      this.apiCredentials = {
        apiKey: creds.key,
        secret: creds.secret,
        passphrase: creds.passphrase,
      };

      console.log(`[交易] API 憑證已獲取: ${this.apiCredentials.apiKey.slice(0, 8)}...`);

      // 創建 L2 客戶端用於交易
      if (config.FUNDER_ADDRESS) {
        // Proxy wallet 模式 (signatureType=1)
        console.log(`[交易] 使用 Proxy Wallet: ${config.FUNDER_ADDRESS}`);
        this.clobClient = new ClobClient(
          CLOB_HTTP_URL,
          CHAIN_ID,
          signer,
          creds,
          1, // signatureType 1 = Polymarket proxy wallet
          config.FUNDER_ADDRESS
        );
      } else {
        // EOA 模式 (signatureType=0)
        console.log(`[交易] 使用 EOA Wallet: ${signer.address}`);
        this.clobClient = new ClobClient(
          CLOB_HTTP_URL,
          CHAIN_ID,
          signer,
          creds
        );
      }

      console.log('✅ 交易客戶端已初始化');
      return true;
    } catch (err) {
      console.error('[交易] 初始化失敗:', err);
      return false;
    }
  }

  /**
   * 從 API 同步實際持倉到內存
   */
  async syncPositionsFromApi(upTokenId: string, downTokenId: string, upPrice: number, downPrice: number): Promise<void> {
    if (config.PAPER_TRADING || !this.clobClient) {
      return;
    }

    try {
      // 查詢 Up 持倉
      const upBalances = await this.clobClient.getBalanceAllowance({ asset_type: 'CONDITIONAL' as any, token_id: upTokenId });
      const upBalance = parseFloat(upBalances?.balance || '0') / 1e6;
      
      if (upBalance > 0.1) {
        if (!this.positions.has(upTokenId)) {
          console.log(`[同步] 發現 Up 持倉: ${upBalance.toFixed(1)} 股 @ ${upPrice.toFixed(1)}¢`);
          this.positions.set(upTokenId, {
            tokenId: upTokenId,
            outcome: 'Up',
            size: Math.floor(upBalance),
            avgBuyPrice: upPrice,
            currentPrice: upPrice,
          });
        } else {
          // 更新現有持倉的數量
          const pos = this.positions.get(upTokenId)!;
          pos.size = Math.floor(upBalance);
          pos.currentPrice = upPrice;
        }
      } else {
        if (this.positions.has(upTokenId)) {
          console.log(`[同步] Up 持倉已清空`);
          this.positions.delete(upTokenId);
        }
      }

      // 查詢 Down 持倉
      const downBalances = await this.clobClient.getBalanceAllowance({ asset_type: 'CONDITIONAL' as any, token_id: downTokenId });
      const downBalance = parseFloat(downBalances?.balance || '0') / 1e6;
      
      if (downBalance > 0.1) {
        if (!this.positions.has(downTokenId)) {
          console.log(`[同步] 發現 Down 持倉: ${downBalance.toFixed(1)} 股 @ ${downPrice.toFixed(1)}¢`);
          this.positions.set(downTokenId, {
            tokenId: downTokenId,
            outcome: 'Down',
            size: Math.floor(downBalance),
            avgBuyPrice: downPrice,
            currentPrice: downPrice,
          });
        } else {
          const pos = this.positions.get(downTokenId)!;
          pos.size = Math.floor(downBalance);
          pos.currentPrice = downPrice;
        }
      } else {
        if (this.positions.has(downTokenId)) {
          console.log(`[同步] Down 持倉已清空`);
          this.positions.delete(downTokenId);
        }
      }
    } catch (error: any) {
      console.error('[同步] 查詢持倉失敗:', error?.message);
    }
  }

  /**
   * 為現有持倉補掛 Limit Sell 訂單
   */
  async placeLimitSellForPosition(
    tokenId: string,
    outcome: 'Up' | 'Down',
    buyPrice: number
  ): Promise<boolean> {
    if (config.PAPER_TRADING || !this.clobClient) {
      return false;
    }

    // 檢查是否已有掛單（必須有有效的 orderId）
    const existingOrder = this.pendingSellOrders.get(tokenId);
    if (existingOrder && existingOrder.length > 0) {
      console.log(`[Limit Sell] 已有掛單: ${existingOrder}`);
      return true;
    }

    try {
      // 查詢可用餘額（allowance = 可賣數量，balance = 總持倉）
      const balances = await this.clobClient.getBalanceAllowance({ asset_type: 'CONDITIONAL' as any, token_id: tokenId });
      if (!balances) {
        console.log(`[Limit Sell] 無法查詢持倉`);
        return false;
      }

      const rawBalance = parseFloat(balances.balance || '0') / 1e6;
      const rawAllowance = parseFloat(balances.allowance || '0') / 1e6;
      
      console.log(`[Limit Sell] balance=${rawBalance.toFixed(4)}, allowance=${rawAllowance.toFixed(4)}`);
      
      // 如果 allowance=0 但 balance>0，先 approve 再下單
      let actualSize: number;
      if (rawAllowance > 0.1) {
        actualSize = parseFloat(rawAllowance.toFixed(1));
      } else if (rawBalance > 0.1) {
        // 需要先 approve token
        console.log(`[Limit Sell] allowance=0，嘗試 approve token...`);
        try {
          await this.clobClient.updateBalanceAllowance({ 
            asset_type: 'CONDITIONAL' as any, 
            token_id: tokenId 
          });
          console.log(`[Limit Sell] Token approved`);
          // 重新查詢 allowance
          const newBalances = await this.clobClient.getBalanceAllowance({ asset_type: 'CONDITIONAL' as any, token_id: tokenId });
          const newAllowance = parseFloat(newBalances?.allowance || '0') / 1e6;
          if (newAllowance > 0.1) {
            actualSize = parseFloat(newAllowance.toFixed(1));
          } else {
            console.log(`[Limit Sell] Approve 後 allowance 仍為 0`);
            return false;
          }
        } catch (approveError: any) {
          console.error(`[Limit Sell] Approve 失敗:`, approveError?.message);
          return false;
        }
      } else {
        console.log(`[Limit Sell] 無可賣股份`);
        return false;
      }

      const targetSellPrice = buyPrice + config.PROFIT_TARGET;
      const targetSellPriceDecimal = targetSellPrice / 100;

      console.log(`📊 補掛 Limit Sell: ${actualSize} 股 ${outcome} @ ${targetSellPriceDecimal.toFixed(2)} (+${config.PROFIT_TARGET}¢) [raw: ${rawBalance}]`);

      const sellResponse = await this.clobClient.createAndPostOrder({
        tokenID: tokenId,
        price: targetSellPriceDecimal,
        size: actualSize,
        side: Side.SELL,
      });

      console.log(`📌 LIMIT SELL order placed: ${sellResponse.orderID} @ ${targetSellPriceDecimal.toFixed(2)} x ${actualSize}`);
      this.pendingSellOrders.set(tokenId, sellResponse.orderID || '');
      return true;
    } catch (error: any) {
      console.error('[Limit Sell] 補掛失敗:', error?.message || error);
      return false;
    }
  }

  /**
   * 用 Market Sell 清掉剩餘小數股份
   */
  async marketSellRemainder(
    tokenId: string,
    outcome: 'Up' | 'Down',
    currentPrice: number
  ): Promise<boolean> {
    if (config.PAPER_TRADING || !this.clobClient) {
      return false;
    }

    try {
      const balances = await this.clobClient.getBalanceAllowance({ asset_type: 'CONDITIONAL' as any, token_id: tokenId });
      if (!balances) return false;

      const rawAllowance = parseFloat(balances.allowance || '0') / 1e6;
      
      // 只處理小於 1 股的剩餘（小數部分）
      if (rawAllowance <= 0 || rawAllowance >= 1) {
        return false;
      }

      const sellSize = parseFloat(rawAllowance.toFixed(1));
      if (sellSize <= 0) return false;

      // Market Sell: 用較低價格確保成交
      const marketPrice = Math.max((currentPrice - 5) / 100, 0.01); // 當前價 -5¢

      console.log(`🧹 Market Sell 清理剩餘: ${sellSize} 股 ${outcome} @ ${marketPrice.toFixed(2)}`);

      const sellResponse = await this.clobClient.createAndPostOrder({
        tokenID: tokenId,
        price: marketPrice,
        size: sellSize,
        side: Side.SELL,
      });

      console.log(`✅ Market Sell 完成: ${sellResponse.orderID}`);
      return true;
    } catch (error: any) {
      console.error('[Market Sell] 失敗:', error?.message || error);
      return false;
    }
  }

  /**
   * 買入指定 outcome，成功後立即掛 Limit Sell 訂單
   */
  async buy(
    tokenId: string,
    outcome: 'Up' | 'Down',
    price: number,
    size: number
  ): Promise<boolean> {
    const priceDecimal = price / 100; // cents to decimal
    const targetSellPrice = price + config.PROFIT_TARGET; // 買入價 + 差距值
    const targetSellPriceDecimal = targetSellPrice / 100;

    if (config.PAPER_TRADING) {
      console.log(`📝 [PAPER] BUY ${size} ${outcome} @ ${priceDecimal.toFixed(2)}`);
      console.log(`📝 [PAPER] LIMIT SELL ${size} ${outcome} @ ${targetSellPriceDecimal.toFixed(2)} (target: +${config.PROFIT_TARGET}¢)`);
      this.updatePosition(tokenId, outcome, size, price);
      this.recordTrade(tokenId, outcome, 'BUY', price, size);
      this.pendingSellOrders.set(tokenId, `paper-${Date.now()}`);
      return true;
    }

    if (!this.clobClient) {
      console.error('Trading client not initialized');
      return false;
    }

    try {
      // 1. 執行買入 (使用較高價格確保成交)
      const buyPrice = Math.min(priceDecimal + 0.01, 0.99); // 加 1¢ 確保成交
      const buyResponse = await this.clobClient.createAndPostOrder({
        tokenID: tokenId,
        price: buyPrice,
        size,
        side: Side.BUY,
      });
      console.log(`✅ BUY order placed: ${buyResponse.orderID} @ ${buyPrice.toFixed(2)}`);
      this.updatePosition(tokenId, outcome, size, price);
      this.recordTrade(tokenId, outcome, 'BUY', price, size);

      // 2. 等待買單成交
      await this.sleep(2000);

      // 3. 查詢實際持倉數量並確保有 allowance
      let actualSize = size;
      try {
        const balances = await this.clobClient.getBalanceAllowance({ asset_type: 'CONDITIONAL' as any, token_id: tokenId });
        if (balances) {
          const rawBalance = parseFloat(balances.balance || '0') / 1e6;
          const rawAllowance = parseFloat(balances.allowance || '0') / 1e6;
          console.log(`📊 持倉查詢: balance=${rawBalance.toFixed(4)}, allowance=${rawAllowance.toFixed(4)}`);
          
          // 如果 allowance=0，需要先 approve
          if (rawAllowance < 0.1 && rawBalance > 0.1) {
            console.log(`🔓 Approving token for selling...`);
            await this.clobClient.updateBalanceAllowance({ 
              asset_type: 'CONDITIONAL' as any, 
              token_id: tokenId 
            });
            await this.sleep(1000);
            
            // 重新查詢 allowance
            const newBalances = await this.clobClient.getBalanceAllowance({ asset_type: 'CONDITIONAL' as any, token_id: tokenId });
            const newAllowance = parseFloat(newBalances?.allowance || '0') / 1e6;
            actualSize = parseFloat(newAllowance.toFixed(1));
            console.log(`📊 Approve 後 allowance: ${actualSize}`);
          } else {
            actualSize = parseFloat(rawAllowance.toFixed(1));
          }
        }
      } catch (balanceError: any) {
        console.log(`⚠️ 無法查詢持倉，使用買入數量: ${size}`, balanceError?.message);
      }

      if (actualSize <= 0) {
        console.log(`⚠️ allowance 為 0，跳過 Limit Sell`);
        return true;
      }

      // 4. 掛 Limit Sell 訂單（使用 allowance 數量）
      try {
        const sellResponse = await this.clobClient.createAndPostOrder({
          tokenID: tokenId,
          price: targetSellPriceDecimal,
          size: actualSize,
          side: Side.SELL,
        });
        console.log(`📌 LIMIT SELL order placed: ${sellResponse.orderID} @ ${targetSellPriceDecimal.toFixed(2)} (+${config.PROFIT_TARGET}¢) x ${actualSize}`);
        this.pendingSellOrders.set(tokenId, sellResponse.orderID || '');
      } catch (sellError: any) {
        console.error('Failed to place limit sell order:', sellError?.message || sellError);
        // 重試一次
        await this.sleep(1000);
        try {
          const retryResponse = await this.clobClient!.createAndPostOrder({
            tokenID: tokenId,
            price: targetSellPriceDecimal,
            size: actualSize,
            side: Side.SELL,
          });
          console.log(`📌 LIMIT SELL order placed (retry): ${retryResponse.orderID} x ${actualSize}`);
          this.pendingSellOrders.set(tokenId, retryResponse.orderID || '');
        } catch (retryError: any) {
          console.error('Retry failed:', retryError?.message || retryError);
        }
      }

      return true;
    } catch (error: any) {
      console.error('Buy order failed:', error?.message || error);
      return false;
    }
  }

  /**
   * 強制清倉：取消所有掛單並用 Market Sell 賣出全部
   */
  async forceLiquidate(
    tokenId: string,
    outcome: 'Up' | 'Down',
    currentPrice: number
  ): Promise<boolean> {
    if (config.PAPER_TRADING) {
      console.log(`📝 [PAPER] FORCE LIQUIDATE ${outcome}`);
      this.positions.delete(tokenId);
      this.pendingSellOrders.delete(tokenId);
      return true;
    }

    if (!this.clobClient) {
      console.error('Trading client not initialized');
      return false;
    }

    try {
      // 1. 取消該 token 的所有掛單
      console.log(`🚨 強制清倉: 取消 ${outcome} 的所有掛單...`);
      try {
        await this.clobClient.cancelAll();
        console.log(`✅ 已取消所有掛單`);
      } catch (cancelError: any) {
        console.log(`⚠️ 取消掛單失敗: ${cancelError?.message}`);
      }

      // 等待掛單取消生效
      await this.sleep(1000);

      // 2. 查詢可用餘額
      const balances = await this.clobClient.getBalanceAllowance({ asset_type: 'CONDITIONAL' as any, token_id: tokenId });
      const rawAllowance = parseFloat(balances?.allowance || '0') / 1e6;
      const sellSize = parseFloat(rawAllowance.toFixed(1));

      if (sellSize <= 0) {
        console.log(`[強制清倉] 無可賣股份`);
        this.positions.delete(tokenId);
        this.pendingSellOrders.delete(tokenId);
        return true;
      }

      // 3. Market Sell（用較低價格確保成交）
      const marketPrice = Math.max((currentPrice - 10) / 100, 0.01); // 當前價 -10¢
      console.log(`🚨 Market Sell: ${sellSize} 股 ${outcome} @ ${marketPrice.toFixed(2)}`);

      const response = await this.clobClient.createAndPostOrder({
        tokenID: tokenId,
        price: marketPrice,
        size: sellSize,
        side: Side.SELL,
      });

      console.log(`✅ 強制清倉完成: ${response.orderID}`);
      this.positions.delete(tokenId);
      this.pendingSellOrders.delete(tokenId);
      return true;
    } catch (error: any) {
      console.error('[強制清倉] 失敗:', error?.message || error);
      return false;
    }
  }

  /**
   * 賣出指定 outcome
   */
  async sell(
    tokenId: string,
    outcome: 'Up' | 'Down',
    price: number,
    size: number
  ): Promise<boolean> {
    const priceDecimal = price / 100;

    if (config.PAPER_TRADING) {
      const position = this.positions.get(tokenId);
      const pnl = position ? (price - position.avgBuyPrice) * size : 0;
      console.log(`📝 [PAPER] SELL ${size} ${outcome} @ ${priceDecimal.toFixed(2)} | PnL: ${pnl.toFixed(2)}¢`);
      this.updatePosition(tokenId, outcome, -size, price);
      this.recordTrade(tokenId, outcome, 'SELL', price, size, pnl);
      return true;
    }

    if (!this.clobClient) {
      console.error('Trading client not initialized');
      return false;
    }

    try {
      const response = await this.clobClient.createAndPostOrder({
        tokenID: tokenId,
        price: priceDecimal,
        size,
        side: Side.SELL,
      });

      const position = this.positions.get(tokenId);
      const pnl = position ? (price - position.avgBuyPrice) * size : 0;

      console.log(`✅ SELL order placed: ${response.orderID} | PnL: ${pnl.toFixed(2)}¢`);
      this.updatePosition(tokenId, outcome, -size, price);
      this.recordTrade(tokenId, outcome, 'SELL', price, size, pnl);
      return true;
    } catch (error) {
      console.error('Sell order failed:', error);
      return false;
    }
  }

  /**
   * 取消所有未成交訂單
   */
  async cancelAllOrders(): Promise<void> {
    if (config.PAPER_TRADING || !this.clobClient) return;

    try {
      await this.clobClient.cancelAll();
      console.log('🗑️ All orders cancelled');
    } catch (error) {
      console.error('Failed to cancel orders:', error);
    }
  }

  /**
   * 清倉 - 賣出所有持倉
   */
  async liquidateAll(currentPrices: Map<string, number>): Promise<void> {
    for (const [tokenId, position] of this.positions) {
      if (position.size > 0) {
        const currentPrice = currentPrices.get(tokenId) || position.currentPrice;
        await this.sell(tokenId, position.outcome, currentPrice, position.size);
      }
    }
  }

  /**
   * 更新持倉記錄
   */
  private updatePosition(
    tokenId: string,
    outcome: 'Up' | 'Down',
    sizeDelta: number,
    price: number
  ): void {
    const existing = this.positions.get(tokenId);

    if (!existing) {
      if (sizeDelta > 0) {
        this.positions.set(tokenId, {
          tokenId,
          outcome,
          size: sizeDelta,
          avgBuyPrice: price,
          currentPrice: price,
        });
      }
      return;
    }

    const newSize = existing.size + sizeDelta;

    if (newSize <= 0) {
      this.positions.delete(tokenId);
    } else {
      if (sizeDelta > 0) {
        // 買入 - 計算新的平均成本
        existing.avgBuyPrice =
          (existing.avgBuyPrice * existing.size + price * sizeDelta) / newSize;
      }
      existing.size = newSize;
      existing.currentPrice = price;
    }
  }

  private recordTrade(
    market: string,
    outcome: 'Up' | 'Down',
    side: 'BUY' | 'SELL',
    price: number,
    size: number,
    pnl?: number
  ): void {
    this.tradeHistory.push({
      timestamp: new Date(),
      market,
      outcome,
      side,
      price,
      size,
      pnl,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getPositions(): Map<string, Position> {
    return this.positions;
  }

  getTradeHistory(): TradeRecord[] {
    return this.tradeHistory;
  }

  getTotalPnL(): number {
    return this.tradeHistory
      .filter((t) => t.pnl !== undefined)
      .reduce((sum, t) => sum + (t.pnl || 0), 0);
  }
}
