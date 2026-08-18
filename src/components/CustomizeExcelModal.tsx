import React, { useState, useMemo } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Sparkles,
  Download,
  Calendar,
  Layers,
  Filter,
  BarChart3,
  TrendingUp,
  ShoppingCart,
  Receipt,
  Clock,
  CreditCard,
  CheckCircle2,
} from 'lucide-react';
import { SalesRecord, PurchaseRecord, ExpenseEntry, PaymentRecord } from '../types';
import { ExcelExportOptions } from '../utils/excelExport';
import { standardizeMonth, parseMonthTimestamp } from '../utils/monthUtils';

interface CustomizeExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  salesData: SalesRecord[];
  purchaseData: PurchaseRecord[];
  expenseData: ExpenseEntry[];
  paymentData: PaymentRecord[];
  onExport: (options: ExcelExportOptions) => Promise<void>;
  isExporting: boolean;
}

export const CustomizeExcelModal: React.FC<CustomizeExcelModalProps> = ({
  isOpen,
  onClose,
  salesData,
  purchaseData,
  expenseData,
  paymentData,
  onExport,
  isExporting,
}) => {
  // Sheet Selection States
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeSales, setIncludeSales] = useState(true);
  const [includePurchase, setIncludePurchase] = useState(true);
  const [includeExpense, setIncludeExpense] = useState(true);
  const [includeOutstanding, setIncludeOutstanding] = useState(true);
  const [includePayment, setIncludePayment] = useState(true);

  // Granular Options
  const [includeRegisters, setIncludeRegisters] = useState(true);
  const [allMonthsSelected, setAllMonthsSelected] = useState(true);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);

  // Collect all unique available months
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    salesData.forEach((s) => s.Month && monthsSet.add(standardizeMonth(s.Month)));
    purchaseData.forEach((p) => p.Month && monthsSet.add(standardizeMonth(p.Month)));
    expenseData.forEach((e) => e.month && monthsSet.add(standardizeMonth(e.month)));
    paymentData.forEach((p) => p.Month && monthsSet.add(standardizeMonth(p.Month)));
    
    return Array.from(monthsSet)
      .filter((m) => m && m !== 'Unknown')
      .sort((a, b) => parseMonthTimestamp(a) - parseMonthTimestamp(b));
  }, [salesData, purchaseData, expenseData, paymentData]);

  if (!isOpen) return null;

  const totalSheetsSelected = [
    includeSummary,
    includeSales,
    includePurchase,
    includeExpense,
    includeOutstanding,
    includePayment && paymentData.length > 0,
  ].filter(Boolean).length;

  const handleSelectAllSheets = () => {
    setIncludeSummary(true);
    setIncludeSales(true);
    setIncludePurchase(true);
    setIncludeExpense(true);
    setIncludeOutstanding(true);
    setIncludePayment(true);
  };

  const handleDeselectAllSheets = () => {
    setIncludeSummary(false);
    setIncludeSales(false);
    setIncludePurchase(false);
    setIncludeExpense(false);
    setIncludeOutstanding(false);
    setIncludePayment(false);
  };

  const applyPreset = (preset: 'all' | 'financials' | 'sales_collections' | 'purchases_expenses') => {
    if (preset === 'all') {
      handleSelectAllSheets();
    } else if (preset === 'financials') {
      setIncludeSummary(true);
      setIncludeSales(true);
      setIncludePurchase(true);
      setIncludeExpense(true);
      setIncludeOutstanding(false);
      setIncludePayment(false);
    } else if (preset === 'sales_collections') {
      setIncludeSummary(false);
      setIncludeSales(true);
      setIncludePurchase(false);
      setIncludeExpense(false);
      setIncludeOutstanding(true);
      setIncludePayment(true);
    } else if (preset === 'purchases_expenses') {
      setIncludeSummary(false);
      setIncludeSales(false);
      setIncludePurchase(true);
      setIncludeExpense(true);
      setIncludeOutstanding(true);
      setIncludePayment(false);
    }
  };

  const toggleMonth = (m: string) => {
    if (selectedMonths.includes(m)) {
      const updated = selectedMonths.filter((x) => x !== m);
      setSelectedMonths(updated);
      if (updated.length === 0) {
        setAllMonthsSelected(true);
      }
    } else {
      setSelectedMonths([...selectedMonths, m]);
      setAllMonthsSelected(false);
    }
  };

  const handleExportClick = async () => {
    const options: ExcelExportOptions = {
      includeSummary,
      includeSales,
      includePurchase,
      includeExpense,
      includeOutstanding,
      includePayment,
      includeRegisters,
      selectedMonths: allMonthsSelected ? undefined : selectedMonths,
    };

    await onExport(options);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a3a3a] to-[#2d5a5a] text-white px-6 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shadow-inner">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                ⚙️ Customize Master Excel Report
              </h2>
              <p className="text-xs text-emerald-100/80">
                Choose exactly which sheets, sections, and date ranges to export into your Excel (.xlsx) file
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-gray-800 text-sm">
          {/* Quick Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-500" /> Quick Selection Presets
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllSheets}
                  className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded transition-colors"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllSheets}
                  className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => applyPreset('all')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex flex-col justify-between ${
                  totalSheetsSelected === (paymentData.length > 0 ? 6 : 5)
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-400'
                    : 'border-gray-200 hover:border-gray-300 bg-gray-50 text-gray-700'
                }`}
              >
                <span className="font-bold flex items-center gap-1">🌟 All Sheets</span>
                <span className="text-[10px] text-gray-500 mt-0.5">Full Master Audit</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('financials')}
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 hover:border-teal-400 bg-gray-50 hover:bg-teal-50 text-gray-700 hover:text-teal-900 transition-all text-left flex flex-col justify-between"
              >
                <span className="font-bold flex items-center gap-1">📈 Financials</span>
                <span className="text-[10px] text-gray-500 mt-0.5">Summary + P&L Ops</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('sales_collections')}
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 hover:border-sky-400 bg-gray-50 hover:bg-sky-50 text-gray-700 hover:text-sky-900 transition-all text-left flex flex-col justify-between"
              >
                <span className="font-bold flex items-center gap-1">💰 Sales & Collections</span>
                <span className="text-[10px] text-gray-500 mt-0.5">Sales, Balances & Rec.</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('purchases_expenses')}
                className="px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 hover:border-amber-400 bg-gray-50 hover:bg-amber-50 text-gray-700 hover:text-amber-900 transition-all text-left flex flex-col justify-between"
              >
                <span className="font-bold flex items-center gap-1">🛒 Costs & Payables</span>
                <span className="text-[10px] text-gray-500 mt-0.5">Pur, Exp & Payables</span>
              </button>
            </div>
          </div>

          {/* Sheet Selection Cards Grid */}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
              <Layers size={14} className="text-indigo-500" /> Select Sheets to Include in Workbook
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Sheet 1: Summary Dashboard */}
              <div
                onClick={() => setIncludeSummary(!includeSummary)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                  includeSummary
                    ? 'border-teal-500 bg-teal-50/50 shadow-sm ring-1 ring-teal-400'
                    : 'border-gray-200 bg-white hover:border-gray-300 opacity-60'
                }`}
              >
                <div className="mt-0.5 text-teal-600">
                  {includeSummary ? <CheckSquare size={18} /> : <Square size={18} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                      <BarChart3 size={15} className="text-teal-600" />
                      📊 Summary Dashboard
                    </span>
                    <span className="bg-teal-100 text-teal-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      P&L Statement
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                    KPI cards, Monthly Financial Statement, Gross/Net Profits, Profit Margins & AI Analysis notes.
                  </p>
                </div>
              </div>

              {/* Sheet 2: Sales Summary */}
              <div
                onClick={() => setIncludeSales(!includeSales)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                  includeSales
                    ? 'border-sky-500 bg-sky-50/50 shadow-sm ring-1 ring-sky-400'
                    : 'border-gray-200 bg-white hover:border-gray-300 opacity-60'
                }`}
              >
                <div className="mt-0.5 text-sky-600">
                  {includeSales ? <CheckSquare size={18} /> : <Square size={18} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                      <TrendingUp size={15} className="text-sky-600" />
                      💰 Sales Summary
                    </span>
                    <span className="bg-sky-100 text-sky-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      {salesData.length} Records
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                    Channels breakdown, Month-wise sales, Customer rankings & Detailed Sales Register.
                  </p>
                </div>
              </div>

              {/* Sheet 3: Purchase Summary */}
              <div
                onClick={() => setIncludePurchase(!includePurchase)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                  includePurchase
                    ? 'border-rose-500 bg-rose-50/50 shadow-sm ring-1 ring-rose-400'
                    : 'border-gray-200 bg-white hover:border-gray-300 opacity-60'
                }`}
              >
                <div className="mt-0.5 text-rose-600">
                  {includePurchase ? <CheckSquare size={18} /> : <Square size={18} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                      <ShoppingCart size={15} className="text-rose-600" />
                      🛒 Purchase Summary
                    </span>
                    <span className="bg-rose-100 text-rose-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      {purchaseData.length} Records
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                    Categories breakdown, Month-wise purchases, Vendor rankings & Detailed Purchase Register.
                  </p>
                </div>
              </div>

              {/* Sheet 4: Expense Summary */}
              <div
                onClick={() => setIncludeExpense(!includeExpense)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                  includeExpense
                    ? 'border-amber-500 bg-amber-50/50 shadow-sm ring-1 ring-amber-400'
                    : 'border-gray-200 bg-white hover:border-gray-300 opacity-60'
                }`}
              >
                <div className="mt-0.5 text-amber-600">
                  {includeExpense ? <CheckSquare size={18} /> : <Square size={18} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                      <Receipt size={15} className="text-amber-600" />
                      📋 Expense Summary
                    </span>
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      {expenseData.length} Records
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                    Marketplaces, Expense Type-wise, Brand-wise Net Expenses & Detailed Expense Register.
                  </p>
                </div>
              </div>

              {/* Sheet 5: Outstanding Summary */}
              <div
                onClick={() => setIncludeOutstanding(!includeOutstanding)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                  includeOutstanding
                    ? 'border-indigo-500 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-400'
                    : 'border-gray-200 bg-white hover:border-gray-300 opacity-60'
                }`}
              >
                <div className="mt-0.5 text-indigo-600">
                  {includeOutstanding ? <CheckSquare size={18} /> : <Square size={18} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                      <Clock size={15} className="text-indigo-600" />
                      ⏳ Outstanding Summary
                    </span>
                    <span className="bg-indigo-100 text-indigo-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      Aging & Balances
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                    Consolidated Receivables vs Payables, Aging Horizons, Party-wise Balances & Open Register.
                  </p>
                </div>
              </div>

              {/* Sheet 6: Payment Received */}
              <div
                onClick={() => paymentData.length > 0 && setIncludePayment(!includePayment)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                  paymentData.length === 0
                    ? 'border-gray-200 bg-gray-50 opacity-40 cursor-not-allowed'
                    : includePayment
                    ? 'border-emerald-500 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-400'
                    : 'border-gray-200 bg-white hover:border-gray-300 opacity-60'
                }`}
              >
                <div className="mt-0.5 text-emerald-600">
                  {includePayment && paymentData.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                      <CreditCard size={15} className="text-emerald-600" />
                      💸 Payment Received
                    </span>
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      {paymentData.length} Receipts
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                    Channel gateways, Monthly payment collections & Detailed Payment Register.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Transaction Register Toggle */}
          <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between">
            <div>
              <div className="font-semibold text-xs text-gray-900 flex items-center gap-1.5">
                📑 Include Detailed Transaction Registers
              </div>
              <p className="text-[11px] text-gray-500">
                Exports the full item-by-item transaction tables at the bottom of each selected sheet.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIncludeRegisters(!includeRegisters)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out ${
                includeRegisters ? 'bg-emerald-600' : 'bg-gray-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                  includeRegisters ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Month Filter Section */}
          {availableMonths.length > 0 && (
            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-xs text-gray-900 flex items-center gap-1.5">
                    <Calendar size={14} className="text-blue-600" /> Filter by Specific Months (Optional)
                  </span>
                  <p className="text-[11px] text-gray-500">
                    {allMonthsSelected
                      ? 'Currently exporting all months data'
                      : `Filtered to ${selectedMonths.length} selected month(s)`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAllMonthsSelected(true);
                    setSelectedMonths([]);
                  }}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                    allMonthsSelected
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  All Months ({availableMonths.length})
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {availableMonths.map((m) => {
                  const isSelected = !allMonthsSelected && selectedMonths.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMonth(m)}
                      className={`text-xs px-2.5 py-1 rounded-md font-medium border transition-all ${
                        isSelected
                          ? 'bg-blue-50 border-blue-400 text-blue-800 font-bold shadow-xs'
                          : allMonthsSelected
                          ? 'bg-white border-gray-200 text-gray-600 opacity-80 hover:opacity-100'
                          : 'bg-white border-gray-200 text-gray-400'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs text-gray-600 flex items-center gap-1.5">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span>
              <strong>{totalSheetsSelected}</strong> sheet(s) selected for export
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleExportClick}
              disabled={isExporting || totalSheetsSelected === 0}
              className={`px-5 py-2 text-xs font-bold text-white rounded-lg transition-all flex items-center gap-2 shadow-md ${
                totalSheetsSelected === 0
                  ? 'bg-gray-400 cursor-not-allowed opacity-60'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 shadow-emerald-700/20'
              }`}
            >
              {isExporting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Generating Excel...</span>
                </>
              ) : (
                <>
                  <Download size={14} />
                  <span>📥 Export Customized Excel ({totalSheetsSelected} Sheets)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
