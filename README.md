# Polymarket BTC 15-Minute Trading Bot

自動化交易系統，專門針對 Polymarket 上的 **Bitcoin Up or Down 15m** 市場進行盤前套利。

## 策略說明

### 核心邏輯
1. **只在盤前買入** - 在下一局開始前，買入價格低於 50¢ 的 Up 或 Down
2. **快速獲利了結** - 當價格上升 ≥ 2¢ 時立即賣出
3. **開局清倉** - 開局時必須賣出所有持倉，避免持有到結算
4. **趨勢分析** - 分析當前進行中的盤口走勢來預測下一局盤前價格波動

### 風險控制
- 只買入低於 50¢ 的選項（最大虧損有限）
- 薄利多銷策略（2¢ 利潤即出場）
- 開局前強制清倉（避免結算風險）

### 市場格式
- Slug: `btc-updown-15m-{unix_timestamp}`
- 例如: `btc-updown-15m-1769579100`

## 安裝

```bash
# 安裝依賴
npm install

# 複製環境變數範例
cp .env.example .env

# 編輯 .env 填入你的私鑰
```

## 配置

編輯 `.env` 文件：

```env
# Polygon 錢包私鑰（不含 0x 前綴）
PRIVATE_KEY=your_private_key_here

# Polymarket Proxy Wallet 地址 (從 polymarket.com/settings 獲取)
# 如果直接使用 EOA 錢包則留空
FUNDER_ADDRESS=0x...

# 最高買入價格（分，50 = 0.50 USDC）
MAX_BUY_PRICE=50

# 獲利目標（分，2 = 0.02 USDC）
PROFIT_TARGET=2

# 每筆交易最大倉位
MAX_POSITION_SIZE=100

# 輪詢間隔（毫秒）
POLL_INTERVAL_MS=1000

# 模擬交易模式（不執行真實交易）
PAPER_TRADING=true
```

## 使用

```bash
# 測試 API 連接
npm test

# 測試 BTC 15min 市場獲取
npx tsx src/test-btc-market.ts

# 掃描可用的 Up/Down 市場
npm run scan

# 開發模式（熱重載）
npm run dev

# 生產模式
npm run build
npm start
```

## 項目結構

```
src/
├── index.ts           # 主程序入口
├── config.ts          # 配置管理
├── types.ts           # TypeScript 類型定義
├── market-fetcher.ts  # BTC 15min 市場獲取 (slug: btc-updown-15m-{ts})
├── trader.ts          # 交易執行 (CLOB API + Wallet 連接)
├── strategy.ts        # 交易策略邏輯
├── market-scanner.ts  # 掃描所有 Up/Down 市場
├── test-connection.ts # API 連接測試
└── test-btc-market.ts # BTC 15min 市場測試
```

## Wallet 連接說明

### 方法 1: Proxy Wallet (推薦)
1. 前往 [polymarket.com/settings](https://polymarket.com/settings)
2. 複製你的 "Wallet Address" (這是 FUNDER_ADDRESS)
3. 將你的私鑰和 FUNDER_ADDRESS 填入 `.env`

### 方法 2: EOA Wallet
1. 直接使用你的 Polygon 錢包私鑰
2. 確保錢包有足夠的 USDC
3. FUNDER_ADDRESS 留空

## 重要提醒

⚠️ **風險警告**
- 這是實驗性軟件，可能導致資金損失
- 先用 `PAPER_TRADING=true` 模式測試
- 只投入你能承受損失的資金
- Polymarket 可能有地區限制

⚠️ **技術限制**
- API rate limit 可能影響高頻交易
- 流動性不足可能導致滑點
- 網絡延遲可能影響執行時機

## VPS 部署

### 方法 1: 使用部署腳本 (推薦)

```bash
# 在 VPS 上
git clone https://github.com/yourusername/BTCMMaker.git
cd BTCMMaker
chmod +x deploy.sh
sudo ./deploy.sh

# 編輯環境變數
nano .env

# 重啟服務
pm2 restart btc-mm-bot
```

### 方法 2: 使用 Docker

```bash
# 複製 .env
cp .env.example .env
nano .env

# 啟動
docker-compose up -d

# 查看日誌
docker-compose logs -f
```

### 方法 3: 手動部署

```bash
# 安裝依賴
npm ci

# 構建
npm run build

# 使用 PM2 啟動
pm2 start ecosystem.config.cjs

# 或直接啟動
npm start
```

### PM2 常用命令

```bash
pm2 logs btc-mm-bot    # 查看日誌
pm2 monit              # 監控
pm2 restart btc-mm-bot # 重啟
pm2 stop btc-mm-bot    # 停止
pm2 delete btc-mm-bot  # 刪除
```

## 參考資料

- [Polymarket CLOB API](https://docs.polymarket.com/developers/CLOB/introduction)
- [Polymarket Quickstart](https://docs.polymarket.com/quickstart/overview)

## License

MIT
