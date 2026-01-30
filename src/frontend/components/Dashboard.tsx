import React from 'react';
import { TrendingUp, TrendingDown, Clock, DollarSign, Activity, Target, Zap, Play, Square } from 'lucide-react';
import { useBotStore } from '../store/botStore';

export function Dashboard() {
  const { status, market, positions, startBot, stopBot } = useBotStore();

  const formatTime = (ms: number) => {
    if (ms <= 0) return '00:00';
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <div className="cyber-card rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">交易控制</h2>
            <p className="text-gray-500 text-sm">啟動或停止自動交易機器人</p>
          </div>
          <button
            onClick={() => status.running ? stopBot() : startBot()}
            className={`flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 ${
              status.running
                ? 'bg-red-600 hover:bg-red-700 text-white cyber-glow-pink'
                : 'bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white cyber-glow-cyan'
            }`}
          >
            {status.running ? (
              <>
                <Square className="w-6 h-6" />
                停止交易
              </>
            ) : (
              <>
                <Play className="w-6 h-6" />
                啟動交易
              </>
            )}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total PnL */}
        <div className="cyber-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-500 text-sm">總盈虧</span>
            <DollarSign className={`w-5 h-5 ${status.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`} />
          </div>
          <div className={`text-3xl font-bold ${status.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {status.totalPnl >= 0 ? '+' : ''}{status.totalPnl.toFixed(2)}¢
          </div>
          <div className="text-gray-600 text-xs mt-1">
            ${(status.totalPnl / 100).toFixed(4)} USDC
          </div>
        </div>

        {/* Total Trades */}
        <div className="cyber-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-500 text-sm">總交易數</span>
            <Activity className="w-5 h-5 text-purple-400" />
          </div>
          <div className="text-3xl font-bold text-white">
            {status.totalTrades}
          </div>
          <div className="text-gray-600 text-xs mt-1">
            筆交易完成
          </div>
        </div>

        {/* Win Rate */}
        <div className="cyber-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-500 text-sm">勝率</span>
            <Target className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="text-3xl font-bold text-cyan-400">
            {status.winRate.toFixed(1)}%
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
            <div 
              className="bg-gradient-to-r from-cyan-500 to-purple-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(status.winRate, 100)}%` }}
            />
          </div>
        </div>

        {/* Bot Status */}
        <div className="cyber-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-500 text-sm">機器人狀態</span>
            <Zap className={`w-5 h-5 ${status.running ? 'text-yellow-400 animate-pulse' : 'text-gray-600'}`} />
          </div>
          <div className={`text-3xl font-bold ${status.running ? 'text-yellow-400' : 'text-gray-500'}`}>
            {status.running ? 'ACTIVE' : 'IDLE'}
          </div>
          <div className="text-gray-600 text-xs mt-1">
            {status.paperTrade ? '模擬交易模式' : '真實交易模式'}
          </div>
        </div>
      </div>

      {/* Market Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Market */}
        <div className="cyber-card rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-400" />
            市場狀態
          </h3>
          
          {market ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                <div>
                  <div className="text-gray-500 text-xs mb-1">當前市場</div>
                  <div className="text-white font-medium">{market.currentMarket || '等待中...'}</div>
                </div>
                <div className="text-right">
                  <div className="text-gray-500 text-xs mb-1">距離結束</div>
                  <div className="text-cyan-400 font-mono text-xl">{formatTime(market.timeToEnd)}</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-purple-900/20 rounded-lg border border-purple-500/30">
                <div>
                  <div className="text-gray-500 text-xs mb-1">下一市場</div>
                  <div className="text-white font-medium">{market.nextMarket || '等待中...'}</div>
                </div>
                <div className="text-right">
                  <div className="text-gray-500 text-xs mb-1">距離開始</div>
                  <div className="text-purple-400 font-mono text-xl">{formatTime(market.timeToStart)}</div>
                </div>
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="p-4 bg-green-900/20 rounded-lg border border-green-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                    <span className="text-green-400 font-bold">UP</span>
                  </div>
                  <div className="text-3xl font-bold text-white">{market.upPrice.toFixed(1)}¢</div>
                </div>
                <div className="p-4 bg-red-900/20 rounded-lg border border-red-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-5 h-5 text-red-400" />
                    <span className="text-red-400 font-bold">DOWN</span>
                  </div>
                  <div className="text-3xl font-bold text-white">{market.downPrice.toFixed(1)}¢</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>等待市場數據...</p>
            </div>
          )}
        </div>

        {/* Current Positions */}
        <div className="cyber-card rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            當前持倉
          </h3>
          
          {positions.length > 0 ? (
            <div className="space-y-3">
              {positions.map((pos, idx) => (
                <div key={idx} className="p-4 bg-gray-800/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {pos.outcome === 'Up' ? (
                        <TrendingUp className="w-5 h-5 text-green-400" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-400" />
                      )}
                      <span className={`font-bold ${pos.outcome === 'Up' ? 'text-green-400' : 'text-red-400'}`}>
                        {pos.outcome}
                      </span>
                    </div>
                    <span className="text-white font-mono">{pos.size} 股</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="text-gray-500 text-xs">買入價</div>
                      <div className="text-white">{pos.avgBuyPrice.toFixed(1)}¢</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">現價</div>
                      <div className="text-white">{pos.currentPrice.toFixed(1)}¢</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">未實現盈虧</div>
                      <div className={pos.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPnl.toFixed(2)}¢
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>目前沒有持倉</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
