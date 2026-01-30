/**
 * 手動下 Limit Sell 訂單
 * 用法: npx tsx src/place-limit-sell.ts
 */
import { ClobClient, Side } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { config } from './config.js';
import { MarketFetcher } from './market-fetcher.js';

const CLOB_HTTP_URL = 'https://clob.polymarket.com';
const CHAIN_ID = 137;

async function placeLimitSell() {
  console.log('=== 下 Limit Sell 訂單 ===\n');

  if (!config.PRIVATE_KEY) {
    console.error('❌ 請在 .env 設定 PRIVATE_KEY');
    return;
  }

  // 獲取當前市場
  const fetcher = new MarketFetcher();
  await fetcher.syncServerTime();
  const state = await fetcher.getMarketState();

  if (!state) {
    console.error('❌ 無法獲取市場狀態');
    return;
  }

  console.log('📊 當前市場:');
  console.log(`  Up Token: ${state.upTokenId}`);
  console.log(`  Up 價格: ${state.upPrice.toFixed(1)}¢`);
  console.log('');

  // 設定賣單參數
  const tokenId = state.upTokenId;
  const sellPrice = 0.51; // 51¢
  const size = 20; // 20 股

  console.log('📝 準備下單:');
  console.log(`  Token: ${tokenId.slice(0, 20)}...`);
  console.log(`  賣出價格: ${sellPrice} (${sellPrice * 100}¢)`);
  console.log(`  數量: ${size} 股`);
  console.log('');

  // 初始化客戶端
  const signer = new Wallet(config.PRIVATE_KEY);
  const l1Client = new ClobClient(CLOB_HTTP_URL, CHAIN_ID, signer);
  const creds = await l1Client.createOrDeriveApiKey();

  let clobClient: ClobClient;
  if (config.FUNDER_ADDRESS) {
    clobClient = new ClobClient(CLOB_HTTP_URL, CHAIN_ID, signer, creds, 1, config.FUNDER_ADDRESS);
  } else {
    clobClient = new ClobClient(CLOB_HTTP_URL, CHAIN_ID, signer, creds);
  }

  console.log('✅ 客戶端已初始化');
  console.log('');

  // 下單
  try {
    const response = await clobClient.createAndPostOrder({
      tokenID: tokenId,
      price: sellPrice,
      size: size,
      side: Side.SELL,
    });

    console.log('✅ Limit Sell 訂單已下單!');
    console.log(`  Order ID: ${response.orderID}`);
    console.log(`  價格: ${sellPrice * 100}¢`);
    console.log(`  數量: ${size} 股`);
  } catch (error: any) {
    console.error('❌ 下單失敗:', error?.message || error);
  }
}

placeLimitSell().catch(console.error);
