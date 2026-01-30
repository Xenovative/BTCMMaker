import React from 'react';
import { History, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useBotStore } from '../store/botStore';

export function TradeHistory() {
  const { trades } = useBotStore();

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="cyber-card rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-xl font-bold text-white">
          <History className="w-6 h-6 text-purple-400" />
          交易記錄
        </div>
        <span className="text-gray-500 text-sm">{trades.length} 筆交易</span>
      </div>

      {trades.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-500 text-sm border-b border-gray-800">
                <th className="pb-3 font-medium">時間</th>
                <th className="pb-3 font-medium">市場</th>
                <th className="pb-3 font-medium">方向</th>
                <th className="pb-3 font-medium">類型</th>
                <th className="pb-3 font-medium text-right">價格</th>
                <th className="pb-3 font-medium text-right">股數</th>
                <th className="pb-3 font-medium text-right">金額</th>
                <th className="pb-3 font-medium text-right">盈虧</th>
                <th className="pb-3 font-medium text-right">盈虧%</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, idx) => (
                <tr 
                  key={trade.id || idx} 
                  className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                >
                  <td className="py-4 text-gray-400 text-sm font-mono">
                    {formatTime(trade.timestamp)}
                  </td>
                  <td className="py-4 text-white text-sm max-w-[200px] truncate">
                    {trade.market}
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-1">
                      {trade.outcome === 'Up' ? (
                        <TrendingUp className="w-4 h-4 text-green-400" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-400" />
                      )}
                      <span className={trade.outcome === 'Up' ? 'text-green-400' : 'text-red-400'}>
                        {trade.outcome}
                      </span>
                    </div>
                  </td>
                  <td className="py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      trade.side === 'BUY' 
                        ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-500/30' 
                        : 'bg-pink-900/50 text-pink-400 border border-pink-500/30'
                    }`}>
                      {trade.side === 'BUY' ? '買入' : '賣出'}
                    </span>
                  </td>
                  <td className="py-4 text-right text-white font-mono">
                    {trade.price.toFixed(1)}¢
                  </td>
                  <td className="py-4 text-right text-white font-mono">
                    {trade.size}
                  </td>
                  <td className="py-4 text-right text-gray-400 font-mono">
                    ${((trade.price / 100) * trade.size).toFixed(2)}
                  </td>
                  <td className="py-4 text-right">
                    {trade.pnl !== undefined ? (
                      <div className={`flex items-center justify-end gap-1 font-mono ${
                        trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {trade.pnl >= 0 ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4" />
                        )}
                        {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}¢
                      </div>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </td>
                  <td className="py-4 text-right">
                    {trade.pnlPercent !== undefined ? (
                      <span className={`font-mono ${
                        trade.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12">
          <History className="w-16 h-16 mx-auto mb-4 text-gray-700" />
          <p className="text-gray-500 text-lg">還沒有交易記錄</p>
          <p className="text-gray-600 text-sm mt-1">啟動機器人後，交易記錄會顯示在這裡</p>
        </div>
      )}

      {/* Summary Stats */}
      {trades.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-800">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="text-gray-500 text-xs mb-1">總交易數</div>
              <div className="text-white font-bold text-xl">{trades.length}</div>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="text-gray-500 text-xs mb-1">買入次數</div>
              <div className="text-cyan-400 font-bold text-xl">
                {trades.filter(t => t.side === 'BUY').length}
              </div>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="text-gray-500 text-xs mb-1">賣出次數</div>
              <div className="text-pink-400 font-bold text-xl">
                {trades.filter(t => t.side === 'SELL').length}
              </div>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <div className="text-gray-500 text-xs mb-1">總盈虧</div>
              <div className={`font-bold text-xl ${
                trades.reduce((sum, t) => sum + (t.pnl || 0), 0) >= 0 
                  ? 'text-green-400' 
                  : 'text-red-400'
              }`}>
                {trades.reduce((sum, t) => sum + (t.pnl || 0), 0) >= 0 ? '+' : ''}
                {trades.reduce((sum, t) => sum + (t.pnl || 0), 0).toFixed(2)}¢
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
