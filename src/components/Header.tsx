import React from 'react';
import { ExternalLink, Settings, RefreshCw } from 'lucide-react';

interface HeaderProps {
  sheetUrls: {
    sales: string;
    purchase: string;
    expense: string;
  };
  entryCount: number;
  onOpenModal: () => void;
  lastSyncTimes?: {
    sales: string;
    purchase: string;
    expense: string;
  };
  onRefreshData?: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  sheetUrls,
  entryCount,
  onOpenModal,
  lastSyncTimes,
  onRefreshData,
  isRefreshing = false,
}) => {
  return (
    <div className="bg-gradient-to-r from-[#1a3a3a] to-[#2d5a5a] text-white px-6 py-3.5 rounded-xl mb-5 flex justify-between items-center flex-wrap gap-3 shadow-md">
      <div>
        <h1 className="text-lg font-bold tracking-wide flex items-center gap-2">
          📊 Expense & Business Ledger
        </h1>
        <div className="text-[11px] opacity-80">Google Sheets Dashboard — Sales, Purchase & Expense</div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Real-time Sync Status Indicator */}
        <div className="flex items-center gap-2 bg-black/25 border border-white/15 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/90 shadow-inner">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-emerald-300 font-semibold">Live Sync:</span>
            <span>💰 Sales: <strong className="text-white">{lastSyncTimes?.sales || 'Just now'}</strong></span>
            <span className="text-white/40">|</span>
            <span>🛒 Pur: <strong className="text-white">{lastSyncTimes?.purchase || 'Just now'}</strong></span>
            <span className="text-white/40">|</span>
            <span>📋 Exp: <strong className="text-white">{lastSyncTimes?.expense || 'Just now'}</strong></span>
          </div>
          {onRefreshData && (
            <button
              onClick={onRefreshData}
              disabled={isRefreshing}
              title="Refresh latest data from Google Sheets API"
              className="ml-1 p-1 hover:bg-white/10 rounded transition-colors text-emerald-200 hover:text-white"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          )}
        </div>

        <a
          href={sheetUrls.sales}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1 shadow-sm"
          title="Open Sales Sheet in Google Sheets"
        >
          💰 Sales <ExternalLink size={11} />
        </a>

        <a
          href={sheetUrls.purchase}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1 shadow-sm"
          title="Open Purchase Sheet in Google Sheets"
        >
          🛒 Purchase <ExternalLink size={11} />
        </a>

        <a
          href={sheetUrls.expense}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1 shadow-sm"
          title="Open Expense Sheet in Google Sheets"
        >
          📋 Expense <ExternalLink size={11} />
        </a>

        <button
          onClick={onOpenModal}
          title="Configure Sheet URLs & Inspect Headers"
          className="bg-[#27ae60] hover:bg-[#1e8449] text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 shadow-sm ml-1"
        >
          <Settings size={14} /> ⚙️ Link Settings & Auto-Set
        </button>

        <span className="bg-white/20 px-2.5 py-1 rounded-full text-[11px] font-medium">
          {entryCount} Entries
        </span>
      </div>
    </div>
  );
};
