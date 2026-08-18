import React, { useState, useRef, useEffect } from 'react';
import {
  ExternalLink,
  Settings,
  RefreshCw,
  FileSpreadsheet,
  Download,
  Calculator,
  ChevronDown,
  CheckSquare,
  Square,
  SlidersHorizontal,
  CheckCircle2,
  Database,
} from 'lucide-react';
import { ExcelExportOptions } from '../utils/excelExport';

interface HeaderProps {
  sheetUrls: {
    sales: string;
    purchase: string;
    expense: string;
  };
  entryCount: number;
  onOpenModal: () => void;
  onOpenMongoModal?: () => void;
  isMongoConnected?: boolean;
  lastSyncTimes?: {
    sales: string;
    purchase: string;
    expense: string;
  };
  onRefreshData?: () => void;
  isRefreshing?: boolean;
  onExportExcel?: (options?: ExcelExportOptions) => void;
  onOpenCustomizeExcel?: () => void;
  isExportingExcel?: boolean;
  onOpenFormulaReference?: () => void;
  hasPaymentData?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  sheetUrls,
  entryCount,
  onOpenModal,
  onOpenMongoModal,
  isMongoConnected = true,
  lastSyncTimes,
  onRefreshData,
  isRefreshing = false,
  onExportExcel,
  onOpenCustomizeExcel,
  isExportingExcel = false,
  onOpenFormulaReference,
  hasPaymentData = true,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Quick sheet selection state in header
  const [selectedSheets, setSelectedSheets] = useState({
    summary: true,
    sales: true,
    purchase: true,
    expense: true,
    outstanding: true,
    payment: true,
  });

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalSelected = [
    selectedSheets.summary,
    selectedSheets.sales,
    selectedSheets.purchase,
    selectedSheets.expense,
    selectedSheets.outstanding,
    hasPaymentData && selectedSheets.payment,
  ].filter(Boolean).length;

  const totalPossible = hasPaymentData ? 6 : 5;

  const toggleSheet = (key: keyof typeof selectedSheets) => {
    setSelectedSheets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectAll = () => {
    setSelectedSheets({
      summary: true,
      sales: true,
      purchase: true,
      expense: true,
      outstanding: true,
      payment: true,
    });
  };

  const handleClearAll = () => {
    setSelectedSheets({
      summary: false,
      sales: false,
      purchase: false,
      expense: false,
      outstanding: false,
      payment: false,
    });
  };

  const handleQuickExport = () => {
    if (onExportExcel) {
      const options: ExcelExportOptions = {
        includeSummary: selectedSheets.summary,
        includeSales: selectedSheets.sales,
        includePurchase: selectedSheets.purchase,
        includeExpense: selectedSheets.expense,
        includeOutstanding: selectedSheets.outstanding,
        includePayment: selectedSheets.payment,
        includeRegisters: true,
      };
      onExportExcel(options);
    }
    setIsDropdownOpen(false);
  };

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

        {/* Master Excel Report with Multi-Select Dropdown & Customization Modal */}
        {(onExportExcel || onOpenCustomizeExcel) && (
          <div className="relative flex items-center shadow-md rounded-lg" ref={dropdownRef}>
            {/* Primary Action Button: Opens Customization Modal */}
            <button
              onClick={() => {
                if (onOpenCustomizeExcel) {
                  onOpenCustomizeExcel();
                } else if (onExportExcel) {
                  handleQuickExport();
                }
              }}
              disabled={isExportingExcel}
              title="Open Excel Export Customizer & Summary Preview"
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white text-xs font-bold px-3.5 py-1.5 rounded-l-lg transition-all flex items-center gap-1.5 border border-emerald-400/30"
            >
              {isExportingExcel ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Generating Excel...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet size={14} className="text-emerald-200" />
                  <span>📥 Export Excel</span>
                  <span className="bg-emerald-800/80 text-[10px] font-semibold px-1.5 py-0.2 rounded-full border border-emerald-400/30">
                    {totalSelected}/{totalPossible}
                  </span>
                </>
              )}
            </button>

            {/* Dropdown Chevron for Quick Multi-Select */}
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              disabled={isExportingExcel}
              title="Quickly toggle sheets to include in export"
              className={`bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-emerald-100 px-2 py-1.5 transition-all border-y border-r border-emerald-500/30 flex items-center justify-center ${
                onOpenFormulaReference ? 'border-r-0' : 'rounded-r-lg'
              }`}
            >
              <ChevronDown size={14} className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {onOpenFormulaReference && (
              <button
                onClick={onOpenFormulaReference}
                title="View Excel Formula Reference"
                className="bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-emerald-100 px-2 py-1.5 rounded-r-lg transition-all border border-emerald-500/30 flex items-center justify-center"
              >
                <Calculator size={14} />
              </button>
            )}

            {/* Multi-Select Floating Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white text-gray-800 rounded-xl shadow-2xl border border-gray-200 z-50 p-3 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-2">
                  <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <FileSpreadsheet size={14} className="text-emerald-600" /> Choose Export Sheets
                  </span>
                  <div className="flex gap-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-emerald-700 font-semibold hover:underline"
                    >
                      All
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-gray-500 font-semibold hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  {/* Summary Dashboard */}
                  <div
                    onClick={() => toggleSheet('summary')}
                    className="flex items-center justify-between p-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-2 font-medium text-gray-800">
                      {selectedSheets.summary ? (
                        <CheckSquare size={15} className="text-teal-600" />
                      ) : (
                        <Square size={15} className="text-gray-400" />
                      )}
                      📊 Summary Dashboard
                    </span>
                    <span className="text-[10px] bg-teal-50 text-teal-700 font-medium px-1.5 py-0.5 rounded">
                      P&L
                    </span>
                  </div>

                  {/* Sales Summary */}
                  <div
                    onClick={() => toggleSheet('sales')}
                    className="flex items-center justify-between p-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-2 font-medium text-gray-800">
                      {selectedSheets.sales ? (
                        <CheckSquare size={15} className="text-sky-600" />
                      ) : (
                        <Square size={15} className="text-gray-400" />
                      )}
                      💰 Sales Summary
                    </span>
                    <span className="text-[10px] bg-sky-50 text-sky-700 font-medium px-1.5 py-0.5 rounded">
                      Sales
                    </span>
                  </div>

                  {/* Purchase Summary */}
                  <div
                    onClick={() => toggleSheet('purchase')}
                    className="flex items-center justify-between p-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-2 font-medium text-gray-800">
                      {selectedSheets.purchase ? (
                        <CheckSquare size={15} className="text-rose-600" />
                      ) : (
                        <Square size={15} className="text-gray-400" />
                      )}
                      🛒 Purchase Summary
                    </span>
                    <span className="text-[10px] bg-rose-50 text-rose-700 font-medium px-1.5 py-0.5 rounded">
                      Purchases
                    </span>
                  </div>

                  {/* Expense Summary */}
                  <div
                    onClick={() => toggleSheet('expense')}
                    className="flex items-center justify-between p-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-2 font-medium text-gray-800">
                      {selectedSheets.expense ? (
                        <CheckSquare size={15} className="text-amber-600" />
                      ) : (
                        <Square size={15} className="text-gray-400" />
                      )}
                      📋 Expense Summary
                    </span>
                    <span className="text-[10px] bg-amber-50 text-amber-700 font-medium px-1.5 py-0.5 rounded">
                      Expenses
                    </span>
                  </div>

                  {/* Outstanding Summary */}
                  <div
                    onClick={() => toggleSheet('outstanding')}
                    className="flex items-center justify-between p-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                  >
                    <span className="flex items-center gap-2 font-medium text-gray-800">
                      {selectedSheets.outstanding ? (
                        <CheckSquare size={15} className="text-indigo-600" />
                      ) : (
                        <Square size={15} className="text-gray-400" />
                      )}
                      ⏳ Outstanding Summary
                    </span>
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 font-medium px-1.5 py-0.5 rounded">
                      Aging
                    </span>
                  </div>

                  {/* Payment Received */}
                  {hasPaymentData && (
                    <div
                      onClick={() => toggleSheet('payment')}
                      className="flex items-center justify-between p-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                    >
                      <span className="flex items-center gap-2 font-medium text-gray-800">
                        {selectedSheets.payment ? (
                          <CheckSquare size={15} className="text-emerald-600" />
                        ) : (
                          <Square size={15} className="text-gray-400" />
                        )}
                        💸 Payment Received
                      </span>
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 font-medium px-1.5 py-0.5 rounded">
                        Bank
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-3 mt-2 border-t border-gray-100 flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={handleQuickExport}
                    disabled={totalSelected === 0}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold text-white transition-all flex items-center justify-center gap-1.5 shadow-sm ${
                      totalSelected === 0
                        ? 'bg-gray-300 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 active:scale-98'
                    }`}
                  >
                    <Download size={13} />
                    <span>Download Selected ({totalSelected} Sheets)</span>
                  </button>

                  {onOpenCustomizeExcel && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsDropdownOpen(false);
                        onOpenCustomizeExcel();
                      }}
                      className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <SlidersHorizontal size={13} />
                      <span>Full Customizer & Summary...</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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

        {onOpenMongoModal && (
          <button
            onClick={onOpenMongoModal}
            title="MongoDB Database Hub — Parallel Queries & Chunked Load Balancing"
            className="bg-emerald-900/80 hover:bg-emerald-900 text-emerald-200 hover:text-white border border-emerald-500/40 text-xs font-bold px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Database size={13} className="text-emerald-400 animate-pulse" />
            <span>🍃 MongoDB Hub</span>
          </button>
        )}

        <span className="bg-white/20 px-2.5 py-1 rounded-full text-[11px] font-medium">
          {entryCount} Entries
        </span>
      </div>
    </div>
  );
};
