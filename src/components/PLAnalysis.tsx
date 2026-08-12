import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { SalesRecord, PurchaseRecord, ExpenseEntry, FilterState } from '../types';
import { standardizeMonth, parseMonthTimestamp } from '../utils/monthUtils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels
);

interface PLAnalysisProps {
  salesData: SalesRecord[];
  purchaseData: PurchaseRecord[];
  expenseData: ExpenseEntry[];
}

const parseNum = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val || '').replace(/[^0-9.-]/g, '').trim();
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
};

// Explicit classification: Debit (Col I) = Invoice (Gross Sales), Credit (Col J) = Return (Credit Note)
const classifySalesRecord = (item: SalesRecord) => {
  const transType = String(item.Transaction_Type || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const debit = parseNum(item.Debit);   // Column I (Invoice Value)
  const credit = parseNum(item.Credit); // Column J (Return Value)
  const net = parseNum(item.Net_Amount);

  let isReturn = transType.includes('credit') || transType.includes('return') || transType.includes('cn') || transType.includes('refund');
  let isInvoice = transType.includes('invoice') || transType.includes('inv') || transType.includes('debitnote') || transType === 'sale' || transType === 'sales';

  if (!isReturn && !isInvoice) {
    if (debit > 0 && credit === 0) isInvoice = true;
    else if (credit > 0 && debit === 0) isReturn = true;
    else if (debit >= credit) isInvoice = true;
    else isReturn = true;
  }

  let invoiceVal = 0;
  let returnVal = 0;

  if (isInvoice) {
    // Invoice (Debit - Column I)
    invoiceVal = debit !== 0 ? Math.abs(debit) : (credit !== 0 ? Math.abs(credit) : Math.abs(net));
  } else {
    // Return (Credit - Column J)
    returnVal = credit !== 0 ? Math.abs(credit) : (debit !== 0 ? Math.abs(debit) : Math.abs(net));
  }

  return { isInvoice, isReturn, invoiceVal, returnVal };
};

const classifyPurchaseRecord = (item: PurchaseRecord) => {
  const transType = String(item.Transaction_Type || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const debit = parseNum(item.Debit);
  const credit = parseNum(item.Credit);
  const net = parseNum(item.Net_Amount);

  let isVendorCredit = transType.includes('credit') || transType.includes('return') || transType.includes('vendorcredit') || transType.includes('refund');
  let isBill = transType.includes('bill') || transType.includes('purchase') || transType.includes('invoice') || transType.includes('inv');

  if (!isVendorCredit && !isBill) {
    if (debit > 0) isBill = true;
    else if (credit > 0) isVendorCredit = true;
    else if (net >= 0) isBill = true;
    else isVendorCredit = true;
  }

  let billVal = 0;
  let vendorCreditVal = 0;

  if (isBill) {
    billVal = debit !== 0 ? Math.abs(debit) : (net !== 0 ? Math.abs(net) : Math.abs(credit));
  } else {
    vendorCreditVal = credit !== 0 ? Math.abs(credit) : (net !== 0 ? Math.abs(net) : Math.abs(debit));
  }

  return { isBill, isVendorCredit, billVal, vendorCreditVal };
};

const parseMonthDate = (mStr: string) => {
  if (!mStr) return 0;
  const d = new Date(mStr);
  if (!isNaN(d.getTime())) return d.getTime();

  const parts = mStr.split(/[\s-]+/);
  if (parts.length === 2) {
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mIdx = monthNames.findIndex((name) => parts[0].toLowerCase().startsWith(name));
    let year = parseInt(parts[1], 10);
    if (!isNaN(year)) {
      if (year < 100) year += 2000;
      if (mIdx !== -1) {
        return new Date(year, mIdx, 1).getTime();
      }
    }
  }
  return 0;
};

export const PLAnalysis: React.FC<PLAnalysisProps> = ({
  salesData,
  purchaseData,
  expenseData,
}) => {
  const [activeView, setActiveView] = useState<'dashboard' | 'matrix' | 'summary'>('dashboard');
  const [filters, setFilters] = useState<FilterState>({
    channel: 'all',
    month: 'all',
    year: 'all',
  });

  const channelsList = useMemo(() => {
    const set = new Set<string>();
    salesData.forEach((s) => s.Channel && set.add(s.Channel.trim()));
    purchaseData.forEach((p) => p.Channel && set.add(p.Channel.trim()));
    expenseData.forEach((e) => e.marketplace && set.add(e.marketplace.trim()));
    return Array.from(set).sort();
  }, [salesData, purchaseData, expenseData]);

  const monthsList = useMemo(() => {
    const set = new Set<string>();
    salesData.forEach((s) => {
      const std = standardizeMonth(s.Month);
      if (std) set.add(std);
    });
    purchaseData.forEach((p) => {
      const std = standardizeMonth(p.Month);
      if (std) set.add(std);
    });
    expenseData.forEach((e) => {
      const std = standardizeMonth(e.month);
      if (std) set.add(std);
    });
    
    return Array.from(set).sort((a, b) => {
      const tA = parseMonthTimestamp(a);
      const tB = parseMonthTimestamp(b);
      if (tA && tB) return tA - tB;
      return a.localeCompare(b);
    });
  }, [salesData, purchaseData, expenseData]);

  const yearsList = useMemo(() => {
    const set = new Set<string>();
    monthsList.forEach((m) => {
      const match = m.match(/\d{4}/);
      if (match) set.add(match[0]);
    });
    return Array.from(set).sort();
  }, [monthsList]);

  // Filtered Datasets
  const filteredSales = useMemo(() => {
    return salesData.filter((item) => {
      const matchChannel =
        filters.channel === 'all' ||
        String(item.Channel).trim() === String(filters.channel).trim();
      const stdM = standardizeMonth(item.Month);
      const matchMonth =
        filters.month === 'all' ||
        stdM === String(filters.month).trim();
      const matchYear =
        filters.year === 'all' ||
        stdM.includes(filters.year);
      return matchChannel && matchMonth && matchYear;
    });
  }, [salesData, filters]);

  const filteredPurchase = useMemo(() => {
    return purchaseData.filter((item) => {
      const matchChannel =
        filters.channel === 'all' ||
        String(item.Channel).trim() === String(filters.channel).trim();
      const stdM = standardizeMonth(item.Month);
      const matchMonth =
        filters.month === 'all' ||
        stdM === String(filters.month).trim();
      const matchYear =
        filters.year === 'all' ||
        stdM.includes(filters.year);
      return matchChannel && matchMonth && matchYear;
    });
  }, [purchaseData, filters]);

  const filteredExpenses = useMemo(() => {
    return expenseData.filter((item) => {
      const matchChannel =
        filters.channel === 'all' ||
        String(item.marketplace).trim() === String(filters.channel).trim();
      const stdM = standardizeMonth(item.month);
      const matchMonth =
        filters.month === 'all' ||
        stdM === String(filters.month).trim();
      const matchYear =
        filters.year === 'all' ||
        stdM.includes(filters.year);
      return matchChannel && matchMonth && matchYear;
    });
  }, [expenseData, filters]);

  // High Level Calculations
  const calc = useMemo(() => {
    let salesInvoice = 0;
    let salesCreditNote = 0;

    filteredSales.forEach((item) => {
      const { isInvoice, invoiceVal, returnVal } = classifySalesRecord(item);
      if (isInvoice) salesInvoice += invoiceVal;
      else salesCreditNote += returnVal;
    });

    let purchaseBill = 0;
    let purchaseVendorCredit = 0;
    filteredPurchase.forEach((item) => {
      const { isBill, billVal, vendorCreditVal } = classifyPurchaseRecord(item);
      if (isBill) purchaseBill += billVal;
      else purchaseVendorCredit += vendorCreditVal;
    });

    const netSales = salesInvoice - salesCreditNote;
    const netPurchase = purchaseBill - purchaseVendorCredit;

    let totalExpenses = 0;
    filteredExpenses.forEach((e) => {
      totalExpenses += e.invoice - e.credit;
    });

    const grossProfit = netSales - netPurchase;
    const grossMarginPct = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
    const netProfit = grossProfit - totalExpenses;
    const profitPct = netSales > 0 ? (netProfit / netSales) * 100 : 0;

    return {
      salesInvoice,
      salesCreditNote,
      netSales,
      purchaseBill,
      purchaseVendorCredit,
      netPurchase,
      grossProfit,
      grossMarginPct,
      totalExpenses,
      netProfit,
      profitPct,
    };
  }, [filteredSales, filteredPurchase, filteredExpenses]);

  // Channel-wise Breakdown
  const channelBreakdown = useMemo(() => {
    const map: Record<
      string,
      { salesInvoice: number; salesReturn: number; purchaseBill: number; purchaseReturn: number; expenses: number }
    > = {};

    channelsList.forEach((c) => {
      map[c] = { salesInvoice: 0, salesReturn: 0, purchaseBill: 0, purchaseReturn: 0, expenses: 0 };
    });

    filteredSales.forEach((item) => {
      const ch = String(item.Channel || 'Direct').trim();
      if (!map[ch]) map[ch] = { salesInvoice: 0, salesReturn: 0, purchaseBill: 0, purchaseReturn: 0, expenses: 0 };
      const { isInvoice, invoiceVal, returnVal } = classifySalesRecord(item);
      if (isInvoice) map[ch].salesInvoice += invoiceVal;
      else map[ch].salesReturn += returnVal;
    });

    filteredPurchase.forEach((item) => {
      const ch = String(item.Channel || 'Direct').trim();
      if (!map[ch]) map[ch] = { salesInvoice: 0, salesReturn: 0, purchaseBill: 0, purchaseReturn: 0, expenses: 0 };
      const { isBill, billVal, vendorCreditVal } = classifyPurchaseRecord(item);
      if (isBill) map[ch].purchaseBill += billVal;
      else map[ch].purchaseReturn += vendorCreditVal;
    });

    filteredExpenses.forEach((item) => {
      const ch = String(item.marketplace || 'Direct').trim();
      if (!map[ch]) map[ch] = { salesInvoice: 0, salesReturn: 0, purchaseBill: 0, purchaseReturn: 0, expenses: 0 };
      map[ch].expenses += item.invoice - item.credit;
    });

    return Object.keys(map)
      .map((ch) => {
        const netSales = map[ch].salesInvoice - map[ch].salesReturn;
        const netPurchase = map[ch].purchaseBill - map[ch].purchaseReturn;
        const expenses = map[ch].expenses;
        const grossProfit = netSales - netPurchase;
        const netProfit = grossProfit - expenses;
        const profitPct = netSales > 0 ? (netProfit / netSales) * 100 : 0;
        return { channel: ch, salesInvoice: map[ch].salesInvoice, salesReturn: map[ch].salesReturn, netSales, netPurchase, grossProfit, expenses, netProfit, profitPct };
      })
      .filter((row) => row.netSales !== 0 || row.netPurchase !== 0 || row.expenses !== 0)
      .sort((a, b) => b.netProfit - a.netProfit);
  }, [filteredSales, filteredPurchase, filteredExpenses, channelsList]);

  // MoM Detailed Comparison
  const momComparison = useMemo(() => {
    const map: Record<
      string,
      {
        grossSales: number;
        returns: number;
        grossPurchase: number;
        vendorCredit: number;
        expenses: number;
      }
    > = {};

    monthsList.forEach((m) => {
      map[m] = {
        grossSales: 0,
        returns: 0,
        grossPurchase: 0,
        vendorCredit: 0,
        expenses: 0,
      };
    });

    filteredSales.forEach((item) => {
      const m = standardizeMonth(item.Month) || 'Unknown';
      if (!map[m]) {
        map[m] = { grossSales: 0, returns: 0, grossPurchase: 0, vendorCredit: 0, expenses: 0 };
      }
      const { isInvoice, invoiceVal, returnVal } = classifySalesRecord(item);
      if (isInvoice) map[m].grossSales += invoiceVal;
      else map[m].returns += returnVal;
    });

    filteredPurchase.forEach((item) => {
      const m = standardizeMonth(item.Month) || 'Unknown';
      if (!map[m]) {
        map[m] = { grossSales: 0, returns: 0, grossPurchase: 0, vendorCredit: 0, expenses: 0 };
      }
      const { isBill, billVal, vendorCreditVal } = classifyPurchaseRecord(item);
      if (isBill) map[m].grossPurchase += billVal;
      else map[m].vendorCredit += vendorCreditVal;
    });

    filteredExpenses.forEach((item) => {
      const m = standardizeMonth(item.month) || 'Unknown';
      if (!map[m]) {
        map[m] = { grossSales: 0, returns: 0, grossPurchase: 0, vendorCredit: 0, expenses: 0 };
      }
      map[m].expenses += item.invoice - item.credit;
    });

    const labels = Object.keys(map).sort((a, b) => {
      const tA = parseMonthTimestamp(a);
      const tB = parseMonthTimestamp(b);
      if (tA && tB) return tA - tB;
      return a.localeCompare(b);
    });

    return labels.map((l) => {
      const mData = map[l];
      const netSales = mData.grossSales - mData.returns;
      const netPurchase = mData.grossPurchase - mData.vendorCredit;
      const grossProfit = netSales - netPurchase;
      const expenses = mData.expenses;
      const netProfit = grossProfit - expenses;
      const profitPct = netSales > 0 ? (netProfit / netSales) * 100 : 0;

      return {
        month: l,
        grossSales: mData.grossSales,
        returns: mData.returns,
        netSales,
        grossPurchase: mData.grossPurchase,
        vendorCredit: mData.vendorCredit,
        netPurchase,
        grossProfit,
        expenses,
        netProfit,
        profitPct,
      };
    });
  }, [filteredSales, filteredPurchase, filteredExpenses, monthsList]);

  const formatRupee = (val: number) =>
    '₹ ' + Math.round(val).toLocaleString('en-IN');

  const formatShortVal = (value: number) => {
    if (Math.abs(value) >= 100000) return '₹' + (value / 100000).toFixed(1) + 'L';
    if (Math.abs(value) >= 1000) return '₹' + (value / 1000).toFixed(0) + 'k';
    return '₹' + Math.round(value);
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-200 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-[#1a3a3a] flex items-center gap-2">
            📈 Profit & Loss (P/L) Analysis
          </h2>
          <span className="text-[11px] text-gray-500">
            Net Sales (Invoice Debit - Return Credit) vs Net Purchase vs Expenses
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-gray-100 p-0.5 rounded-lg">
            <button
              onClick={() => setActiveView('dashboard')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeView === 'dashboard'
                  ? 'bg-white text-[#1a3a3a] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📊 Dashboard Charts
            </button>
            <button
              onClick={() => setActiveView('matrix')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeView === 'matrix'
                  ? 'bg-white text-[#1a3a3a] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📅 Month-wise P/L Statement
            </button>
            <button
              onClick={() => setActiveView('summary')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeView === 'summary'
                  ? 'bg-white text-[#1a3a3a] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📋 Channel Breakdown
            </button>
          </div>

          {/* Filter Section */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filters.channel}
              onChange={(e) => setFilters({ ...filters, channel: e.target.value })}
              className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-700 font-medium"
            >
              <option value="all">All Channels</option>
              {channelsList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={filters.month}
              onChange={(e) => setFilters({ ...filters, month: e.target.value })}
              className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-700 font-medium"
            >
              <option value="all">All Months</option>
              {monthsList.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select
              value={filters.year}
              onChange={(e) => setFilters({ ...filters, year: e.target.value })}
              className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-700 font-medium"
            >
              <option value="all">All Years</option>
              {yearsList.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <button
              onClick={() => setFilters({ channel: 'all', month: 'all', year: 'all' })}
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-md transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {activeView === 'dashboard' && (
        <div>
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <div className="bg-[#f8fafc] p-3 rounded-lg border border-gray-200 border-l-4 border-l-[#3498db]">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Net Sales
              </div>
              <div className="text-lg font-extrabold text-[#1a3a3a] mt-1">
                {formatRupee(calc.netSales)}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Inv (I): {formatShortVal(calc.salesInvoice)} | Ret (J): {formatShortVal(calc.salesCreditNote)}
              </div>
            </div>

            <div className="bg-[#f8fafc] p-3 rounded-lg border border-gray-200 border-l-4 border-l-[#2d5a5a]">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Net Purchase
              </div>
              <div className="text-lg font-extrabold text-[#1a3a3a] mt-1">
                {formatRupee(calc.netPurchase)}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Bill: {formatShortVal(calc.purchaseBill)} | VC: {formatShortVal(calc.purchaseVendorCredit)}
              </div>
            </div>

            <div className="bg-[#f8fafc] p-3 rounded-lg border border-gray-200 border-l-4 border-l-[#27ae60]">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Gross Profit
              </div>
              <div className="text-lg font-extrabold text-[#27ae60] mt-1">
                {formatRupee(calc.grossProfit)}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                Margin: {calc.grossMarginPct.toFixed(1)}%
              </div>
            </div>

            <div className="bg-[#f8fafc] p-3 rounded-lg border border-gray-200 border-l-4 border-l-[#e74c3c]">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Total Expenses
              </div>
              <div className="text-lg font-extrabold text-[#e74c3c] mt-1">
                {formatRupee(calc.totalExpenses)}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                OpEx & Platform fees
              </div>
            </div>

            <div className="bg-[#f8fafc] p-3 rounded-lg border border-gray-200 border-l-4 border-l-[#f39c12]">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Net Profit
              </div>
              <div
                className={`text-lg font-extrabold mt-1 ${
                  calc.netProfit >= 0 ? 'text-[#27ae60]' : 'text-[#e74c3c]'
                }`}
              >
                {formatRupee(calc.netProfit)}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5 font-semibold">
                Net Margin: {calc.profitPct.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Chart Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Chart 1: Month-on-Month Gross Profit vs Expenses */}
            <div className="bg-[#fafbfc] border border-gray-200 p-3.5 rounded-lg min-h-[320px]">
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-xs font-bold text-gray-800">
                  📊 Gross Profit vs Expenses (Month on Month)
                </h4>
                <span className="text-[10px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded font-semibold border border-emerald-200">
                  MoM Comparison
                </span>
              </div>
              <p className="text-[10px] text-gray-500 mb-2">
                Green Bar = Gross Profit | Red Bar = Expenses | Orange Line = Net Profit Margin %
              </p>
              <div className="h-[250px]">
                <Bar
                  data={{
                    labels: momComparison.map((m) => m.month),
                    datasets: [
                      {
                        type: 'bar' as const,
                        label: 'Gross Profit',
                        data: momComparison.map((m) => m.grossProfit),
                        backgroundColor: 'rgba(39, 174, 96, 0.8)',
                        borderColor: '#27ae60',
                        borderWidth: 1,
                        borderRadius: 4,
                      },
                      {
                        type: 'bar' as const,
                        label: 'Expenses',
                        data: momComparison.map((m) => m.expenses),
                        backgroundColor: 'rgba(231, 76, 60, 0.8)',
                        borderColor: '#e74c3c',
                        borderWidth: 1,
                        borderRadius: 4,
                      },
                      {
                        type: 'line' as const,
                        label: 'Net Margin %',
                        data: momComparison.map((m) => m.profitPct),
                        borderColor: '#f39c12',
                        backgroundColor: '#f39c12',
                        borderWidth: 2.5,
                        pointRadius: 4,
                        yAxisID: 'y1',
                      },
                    ] as any,
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'top', labels: { font: { size: 10, weight: 'bold' } } },
                      datalabels: {
                        display: true,
                        anchor: 'end',
                        align: 'top',
                        formatter: (value: number, context: any) => {
                          if (context.dataset.type === 'line') {
                            return value.toFixed(1) + '%';
                          }
                          return formatShortVal(value);
                        },
                        font: { size: 9, weight: 'bold' },
                        color: '#222',
                        offset: -2,
                      },
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: {
                          font: { size: 10 },
                          callback: (value) => formatShortVal(Number(value)),
                        },
                      },
                      y1: {
                        beginAtZero: true,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: {
                          font: { size: 10 },
                          callback: (value) => value + '%',
                        },
                      },
                      x: {
                        ticks: { font: { size: 10, weight: 'bold' } },
                      },
                    },
                  }}
                />
              </div>
            </div>

            {/* Chart 2: Net Sales vs Net Purchase Trend */}
            <div className="bg-[#fafbfc] border border-gray-200 p-3.5 rounded-lg min-h-[320px]">
              <div className="flex justify-between items-center mb-1">
                <h4 className="text-xs font-bold text-gray-800">
                  📈 Net Sales vs Net Purchase vs Net Profit (MoM)
                </h4>
                <span className="text-[10px] bg-blue-50 text-blue-800 px-2 py-0.5 rounded font-semibold border border-blue-200">
                  Revenue vs Cost
                </span>
              </div>
              <p className="text-[10px] text-gray-500 mb-2">
                Blue Bar = Net Sales | Dark Green = Net Purchase | Golden Line = Net Profit
              </p>
              <div className="h-[250px]">
                <Bar
                  data={{
                    labels: momComparison.map((m) => m.month),
                    datasets: [
                      {
                        type: 'bar' as const,
                        label: 'Net Sales',
                        data: momComparison.map((m) => m.netSales),
                        backgroundColor: 'rgba(52, 152, 219, 0.8)',
                        borderColor: '#3498db',
                        borderWidth: 1,
                        borderRadius: 4,
                      },
                      {
                        type: 'bar' as const,
                        label: 'Net Purchase',
                        data: momComparison.map((m) => m.netPurchase),
                        backgroundColor: 'rgba(45, 90, 90, 0.8)',
                        borderColor: '#2d5a5a',
                        borderWidth: 1,
                        borderRadius: 4,
                      },
                      {
                        type: 'line' as const,
                        label: 'Net Profit',
                        data: momComparison.map((m) => m.netProfit),
                        borderColor: '#27ae60',
                        backgroundColor: '#27ae60',
                        borderWidth: 2.5,
                        pointRadius: 4,
                      },
                    ] as any,
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'top', labels: { font: { size: 10, weight: 'bold' } } },
                      datalabels: {
                        display: true,
                        anchor: 'end',
                        align: 'top',
                        formatter: (value: number) => formatShortVal(value),
                        font: { size: 9, weight: 'bold' },
                        color: '#222',
                        offset: -2,
                      },
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: {
                          font: { size: 10 },
                          callback: (value) => formatShortVal(Number(value)),
                        },
                      },
                      x: {
                        ticks: { font: { size: 10, weight: 'bold' } },
                      },
                    },
                  }}
                />
              </div>
            </div>
          </div>

          {/* Chart 3: Channel Wise Net Profit & Profit Margin % */}
          <div className="bg-[#fafbfc] border border-gray-200 p-3.5 rounded-lg min-h-[280px]">
            <h4 className="text-xs font-bold text-center text-gray-800 mb-1">
              📊 Channel-Wise Profitability & Profit Margin %
            </h4>
            <div className="text-[10px] text-center text-gray-500 mb-2">
              Shows absolute Net Profit (Bar) and Net Margin % (Data Label) per Marketplace / Channel
            </div>
            <div className="h-[220px]">
              <Bar
                data={{
                  labels: channelBreakdown.map((c) => c.channel),
                  datasets: [
                    {
                      label: 'Net Profit (₹)',
                      data: channelBreakdown.map((c) => c.netProfit),
                      backgroundColor: channelBreakdown.map((c) =>
                        c.netProfit >= 0 ? 'rgba(39, 174, 96, 0.85)' : 'rgba(231, 76, 60, 0.85)'
                      ),
                      borderRadius: 4,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    datalabels: {
                      display: true,
                      anchor: 'end',
                      align: 'top',
                      formatter: (value: number, context: any) => {
                        const row = channelBreakdown[context.dataIndex];
                        return `${formatShortVal(value)} (${row.profitPct.toFixed(1)}%)`;
                      },
                      font: { size: 9, weight: 'bold' },
                      color: '#222',
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: (value) => formatShortVal(Number(value)),
                      },
                    },
                    x: {
                      ticks: { font: { size: 10, weight: 'bold' } },
                    },
                  },
                }}
              />
            </div>
          </div>
        </div>
      )}

      {activeView === 'matrix' && (
        <div>
          <div className="mb-3 flex justify-between items-center">
            <h4 className="text-xs font-bold text-[#1a3a3a]">
              📅 Month-On-Month Profit & Loss Financial Matrix
            </h4>
            <span className="text-[11px] text-gray-500 italic">
              Note: Net Sales = Invoice Debit (Col I) - Credit Note Return (Col J)
            </span>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs text-center border-collapse min-w-[900px]">
              <thead className="bg-[#1a3a3a] text-white">
                <tr>
                  <th className="py-2.5 px-3 text-left">Month</th>
                  <th className="py-2.5 px-3">Gross Sales (Inv - I)</th>
                  <th className="py-2.5 px-3">Return (CN - J)</th>
                  <th className="py-2.5 px-3 bg-[#244e4e]">Net Sales</th>
                  <th className="py-2.5 px-3">Gross Purchase</th>
                  <th className="py-2.5 px-3">Vendor Credit</th>
                  <th className="py-2.5 px-3">Net Purchase</th>
                  <th className="py-2.5 px-3 bg-[#1e5837]">Gross Profit</th>
                  <th className="py-2.5 px-3 text-red-200">Expenses</th>
                  <th className="py-2.5 px-3 bg-[#225828]">Net Profit</th>
                  <th className="py-2.5 px-3">Net Margin %</th>
                </tr>
              </thead>
              <tbody>
                {momComparison.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-gray-400">
                      No data available for selected filters
                    </td>
                  </tr>
                ) : (
                  momComparison.map((m, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-2 px-3 text-left font-bold text-gray-800">{m.month}</td>
                      <td className="py-2 px-3 text-blue-700 font-medium">{formatRupee(m.grossSales)}</td>
                      <td className="py-2 px-3 text-red-600 font-medium">{formatRupee(m.returns)}</td>
                      <td className="py-2 px-3 font-bold text-[#1a3a3a] bg-blue-50/50">{formatRupee(m.netSales)}</td>
                      <td className="py-2 px-3 text-gray-700">{formatRupee(m.grossPurchase)}</td>
                      <td className="py-2 px-3 text-gray-500">{formatRupee(m.vendorCredit)}</td>
                      <td className="py-2 px-3 font-semibold text-gray-800">{formatRupee(m.netPurchase)}</td>
                      <td className="py-2 px-3 font-bold text-[#27ae60] bg-emerald-50/50">{formatRupee(m.grossProfit)}</td>
                      <td className="py-2 px-3 text-[#e74c3c] font-semibold">{formatRupee(m.expenses)}</td>
                      <td
                        className={`py-2 px-3 font-extrabold ${
                          m.netProfit >= 0 ? 'text-[#27ae60] bg-emerald-50' : 'text-[#e74c3c] bg-red-50'
                        }`}
                      >
                        {formatRupee(m.netProfit)}
                      </td>
                      <td
                        className={`py-2 px-3 font-bold ${
                          m.profitPct >= 0 ? 'text-[#27ae60]' : 'text-[#e74c3c]'
                        }`}
                      >
                        {m.profitPct.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                )}
                <tr className="bg-gray-100 font-bold border-t-2 border-[#1a3a3a] text-xs">
                  <td className="py-2.5 px-3 text-left">TOTAL / AVG</td>
                  <td className="py-2.5 px-3 text-blue-800">{formatRupee(calc.salesInvoice)}</td>
                  <td className="py-2.5 px-3 text-red-700">{formatRupee(calc.salesCreditNote)}</td>
                  <td className="py-2.5 px-3 text-[#1a3a3a] bg-blue-100/50">{formatRupee(calc.netSales)}</td>
                  <td className="py-2.5 px-3">{formatRupee(calc.purchaseBill)}</td>
                  <td className="py-2.5 px-3">{formatRupee(calc.purchaseVendorCredit)}</td>
                  <td className="py-2.5 px-3">{formatRupee(calc.netPurchase)}</td>
                  <td className="py-2.5 px-3 text-[#27ae60] bg-emerald-100/50">{formatRupee(calc.grossProfit)}</td>
                  <td className="py-2.5 px-3 text-[#e74c3c]">{formatRupee(calc.totalExpenses)}</td>
                  <td
                    className={`py-2.5 px-3 font-black ${
                      calc.netProfit >= 0 ? 'text-[#27ae60] bg-emerald-100' : 'text-[#e74c3c] bg-red-100'
                    }`}
                  >
                    {formatRupee(calc.netProfit)}
                  </td>
                  <td
                    className={`py-2.5 px-3 ${
                      calc.profitPct >= 0 ? 'text-[#27ae60]' : 'text-[#e74c3c]'
                    }`}
                  >
                    {calc.profitPct.toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === 'summary' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sales Summary Box */}
            <div className="bg-[#f8fafc] border border-gray-200 rounded-xl p-4">
              <h4 className="text-xs font-bold text-[#1a3a3a] mb-3 pb-2 border-b-2 border-gray-200">
                📋 Sales Summary (Column I Debit vs Column J Credit)
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">Invoice Sales (Debit - Column I)</span>
                  <span className="font-semibold text-[#3498db]">
                    {formatRupee(calc.salesInvoice)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">Credit Note Returns (Credit - Column J)</span>
                  <span className="font-semibold text-[#e74c3c]">
                    {formatRupee(calc.salesCreditNote)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t-2 border-gray-300 font-bold text-[#1a3a3a]">
                  <span>Net Sales = Invoice (Debit) - Return (Credit)</span>
                  <span className="text-[#27ae60]">{formatRupee(calc.netSales)}</span>
                </div>
              </div>
            </div>

            {/* Purchase Summary Box */}
            <div className="bg-[#f8fafc] border border-gray-200 rounded-xl p-4">
              <h4 className="text-xs font-bold text-[#1a3a3a] mb-3 pb-2 border-b-2 border-gray-200">
                📋 Purchase Summary
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">Bill (Total Purchase)</span>
                  <span className="font-semibold text-[#3498db]">
                    {formatRupee(calc.purchaseBill)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-600">Vendor Credit (Total Return)</span>
                  <span className="font-semibold text-[#e74c3c]">
                    {formatRupee(calc.purchaseVendorCredit)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t-2 border-gray-300 font-bold text-[#1a3a3a]">
                  <span>Net Purchase</span>
                  <span className="text-[#27ae60]">{formatRupee(calc.netPurchase)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Channel Wise Table */}
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <h4 className="text-xs font-bold text-[#1a3a3a] p-3 bg-gray-50 border-b border-gray-200">
              📋 P/L Summary - Channel Wise
            </h4>
            <table className="w-full text-xs text-center border-collapse min-w-[700px]">
              <thead className="bg-[#1a3a3a] text-white">
                <tr>
                  <th className="py-2.5 px-3 text-left">Channel</th>
                  <th className="py-2.5 px-3">Gross Sales (I)</th>
                  <th className="py-2.5 px-3">Return (J)</th>
                  <th className="py-2.5 px-3">Net Sales (₹)</th>
                  <th className="py-2.5 px-3">Net Purchase (₹)</th>
                  <th className="py-2.5 px-3">Gross Profit (₹)</th>
                  <th className="py-2.5 px-3">Expenses (₹)</th>
                  <th className="py-2.5 px-3">Net Profit (₹)</th>
                  <th className="py-2.5 px-3">Profit %</th>
                </tr>
              </thead>
              <tbody>
                {channelBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-gray-400">
                      No data available
                    </td>
                  </tr>
                ) : (
                  channelBreakdown.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-left font-bold text-gray-800">{row.channel}</td>
                      <td className="py-2 px-3 text-blue-700">{formatRupee(row.salesInvoice)}</td>
                      <td className="py-2 px-3 text-red-600">{formatRupee(row.salesReturn)}</td>
                      <td className="py-2 px-3 font-semibold text-gray-800">{formatRupee(row.netSales)}</td>
                      <td className="py-2 px-3 text-gray-800">{formatRupee(row.netPurchase)}</td>
                      <td className="py-2 px-3 text-[#27ae60] font-semibold">
                        {formatRupee(row.grossProfit)}
                      </td>
                      <td className="py-2 px-3 text-[#e74c3c]">{formatRupee(row.expenses)}</td>
                      <td
                        className={`py-2 px-3 font-bold ${
                          row.netProfit >= 0 ? 'text-[#27ae60]' : 'text-[#e74c3c]'
                        }`}
                      >
                        {formatRupee(row.netProfit)}
                      </td>
                      <td
                        className={`py-2 px-3 font-bold ${
                          row.profitPct >= 0 ? 'text-[#27ae60]' : 'text-[#e74c3c]'
                        }`}
                      >
                        {row.profitPct.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                )}
                <tr className="bg-gray-100 font-bold border-t-2 border-[#1a3a3a]">
                  <td className="py-2.5 px-3 text-left">TOTAL</td>
                  <td className="py-2.5 px-3 text-blue-800">{formatRupee(calc.salesInvoice)}</td>
                  <td className="py-2.5 px-3 text-red-700">{formatRupee(calc.salesCreditNote)}</td>
                  <td className="py-2.5 px-3">{formatRupee(calc.netSales)}</td>
                  <td className="py-2.5 px-3">{formatRupee(calc.netPurchase)}</td>
                  <td className="py-2.5 px-3 text-[#27ae60]">
                    {formatRupee(calc.grossProfit)}
                  </td>
                  <td className="py-2.5 px-3 text-[#e74c3c]">
                    {formatRupee(calc.totalExpenses)}
                  </td>
                  <td
                    className={`py-2.5 px-3 ${
                      calc.netProfit >= 0 ? 'text-[#27ae60]' : 'text-[#e74c3c]'
                    }`}
                  >
                    {formatRupee(calc.netProfit)}
                  </td>
                  <td
                    className={`py-2.5 px-3 ${
                      calc.profitPct >= 0 ? 'text-[#27ae60]' : 'text-[#e74c3c]'
                    }`}
                  >
                    {calc.profitPct.toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
