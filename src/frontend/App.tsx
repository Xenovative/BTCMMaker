import React, { useEffect, useState } from 'react';
import { Bitcoin, Settings, BarChart3, History, Wallet, Activity, Zap } from 'lucide-react';
import { useBotStore } from './store/botStore';
import { Dashboard } from './components/Dashboard';
import { ConfigPanel } from './components/ConfigPanel';
import { TradeHistory } from './components/TradeHistory';

type Tab = 'dashboard' | 'config' | 'trades';

function App() {
  const { connect, status } = useBotStore();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  useEffect(() => {
    connect();
  }, [connect]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: '控制台', icon: <BarChart3 className="w-5 h-5" /> },
    { id: 'config', label: '設定', icon: <Settings className="w-5 h-5" /> },
    { id: 'trades', label: '交易記錄', icon: <History className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen bg-cyber-black relative overflow-hidden">
      {/* Scanline effect */}
      <div className="scanline" />
      
      {/* Background grid */}
      <div className="fixed inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(147, 51, 234, 0.3) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(147, 51, 234, 0.3) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}
      />

      {/* Header */}
      <header className="relative z-10 border-b border-purple-900/50 bg-cyber-dark/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="bg-gradient-to-br from-orange-500 to-yellow-500 p-3 rounded-xl cyber-glow">
                  <Bitcoin className="w-8 h-8 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 via-pink-500 to-cyan-400 bg-clip-text text-transparent">
                  BTC 15M TRADING BOT
                </h1>
                <p className="text-gray-500 text-sm font-mono">POLYMARKET AUTO-TRADER v1.0</p>
              </div>
            </div>
            
            {/* Status indicators */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-400">{status.connected ? 'CONNECTED' : 'OFFLINE'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className={`w-4 h-4 ${status.running ? 'text-cyan-400' : 'text-gray-600'}`} />
                <span className={`text-sm ${status.running ? 'text-cyan-400' : 'text-gray-500'}`}>
                  {status.running ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                status.paperTrade 
                  ? 'bg-green-900/50 text-green-400 border border-green-500/50' 
                  : 'bg-red-900/50 text-red-400 border border-red-500/50'
              }`}>
                {status.paperTrade ? '📝 PAPER' : '💰 LIVE'}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="relative z-10 border-b border-purple-900/30 bg-cyber-dark/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-300 border-b-2 ${
                  activeTab === tab.id
                    ? 'text-cyan-400 border-cyan-400 bg-cyan-400/10'
                    : 'text-gray-500 border-transparent hover:text-purple-400 hover:border-purple-400/50 hover:bg-purple-400/5'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'config' && <ConfigPanel />}
        {activeTab === 'trades' && <TradeHistory />}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-10 bg-cyber-dark/90 border-t border-purple-900/30 backdrop-blur-md py-2">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between text-xs">
          <span className="text-gray-600 font-mono">
            策略: 盤前買入 {'<'} 50¢ → 升 ≥ 2¢ 賣出 → 開盤前清倉
          </span>
          <span className="text-purple-500 font-mono">
            ⚡ CYBER TRADING SYSTEM
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
