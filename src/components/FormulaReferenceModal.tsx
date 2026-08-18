import React from 'react';
import { X, Calculator, FunctionSquare, LayoutTemplate, PieChart } from 'lucide-react';

interface FormulaReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FormulaReferenceModal: React.FC<FormulaReferenceModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white p-5 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <Calculator size={22} className="text-emerald-200" />
            <h2 className="text-xl font-bold tracking-wide">Excel Export Formula Reference</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors"
            title="Close Reference"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto bg-slate-50 flex-1 custom-scrollbar">
          <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-xl text-sm leading-relaxed">
            <strong>Transparency Notice:</strong> All exported Excel reports contain <em>native dynamic Excel formulas</em>. This means if you change a raw transaction or cell value in Excel, the totals, subtotals, margins, and percentages will automatically update. Below is a reference of the key formulas applied in the export.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Summary Dashboard */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                <LayoutTemplate size={18} className="text-blue-600" /> 📊 Summary Dashboard
              </h3>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Net Sales</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Gross Sales - Sales Returns</code>
                </li>
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Net Purchases</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Gross Purchases - Vendor Credits</code>
                </li>
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Gross Profit</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Net Sales - Net Purchases</code>
                </li>
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Net Profit</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Gross Profit - Total Expenses</code>
                </li>
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Margin %</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Net Profit / Net Sales</code>
                </li>
              </ul>
            </div>

            {/* Sales Summary */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                <FunctionSquare size={18} className="text-emerald-600" /> 💰 Sales Summary
              </h3>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Channel Net</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Gross Sales - Returns</code>
                </li>
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Return Rate %</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Returns / Gross Sales</code>
                </li>
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Channel Share %</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Channel Net / Total Net Sales</code>
                </li>
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Customer Outst.</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Open Balance + Overdue</code>
                </li>
              </ul>
            </div>

            {/* Purchase Summary */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                <FunctionSquare size={18} className="text-sky-600" /> 🛒 Purchase Summary
              </h3>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Channel Net</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Gross Bills - Vendor Credits</code>
                </li>
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Credit Rate %</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Vendor Credits / Gross Bills</code>
                </li>
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Vendor Payables</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Open Balance + Overdue</code>
                </li>
              </ul>
            </div>

            {/* Expense & Outstanding */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                <PieChart size={18} className="text-purple-600" /> 📋 Expenses & ⏳ Outstanding
              </h3>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Net Expense</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Invoices - Credits</code>
                </li>
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Expense / Sales %</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Net Expense / (Net Sales from Dashboard)</code>
                </li>
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Net Receivables</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= Total Invoices - Total Credit Notes</code>
                </li>
                <li className="flex justify-between items-start gap-4">
                  <span className="font-medium text-slate-700">Settled Rate %</span>
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-800 font-mono break-all">= (Paid + Closed) / Net Billed Amount</code>
                </li>
              </ul>
            </div>

          </div>
        </div>

        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
};
