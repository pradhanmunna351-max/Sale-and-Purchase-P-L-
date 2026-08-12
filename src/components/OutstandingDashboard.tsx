import React, { useState, useMemo } from 'react';
import { SalesRecord, PurchaseRecord, FilterState } from '../types';
import { standardizeMonth, parseMonthTimestamp } from '../utils/monthUtils';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface OutstandingDashboardProps {
  salesData: SalesRecord[];
  purchaseData: PurchaseRecord[];
}

// Helper functions for parsing date and calculating days old accurately
function parseDateToTimestamp(dateStr: any): number | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str) return null;

  // 1. If numeric Excel serial date (e.g. 45000)
  if (!isNaN(Number(str)) && Number(str) > 30000 && Number(str) < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30)).getTime();
    return excelEpoch + Number(str) * 86400000;
  }

  // 2. Handle DD-MM-YYYY or DD/MM/YYYY specifically for Indian context
  const parts = str.split(/[-/]/);
  if (parts.length === 3 && parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length >= 2) {
    if (!isNaN(Number(parts[1]))) {
      const p1 = parseInt(parts[0], 10);
      const p2 = parseInt(parts[1], 10);
      let y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
      if (p1 <= 31 && p2 <= 12) {
        return new Date(y, p2 - 1, p1).getTime();
      }
    }
  }

  // 3. Fallback to standard Date parse
  const dTime = new Date(str).getTime();
  if (!isNaN(dTime)) return dTime;

  return null;
}

function calculateDaysOld(dateStr: any): number {
  const timestamp = parseDateToTimestamp(dateStr);
  if (!timestamp) return 0;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  const d = new Date(timestamp);
  const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  
  const diffMs = today - targetDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function OutstandingDashboard({ salesData, purchaseData }: OutstandingDashboardProps) {
  const [filters, setFilters] = useState<FilterState>({
    channel: 'all',
    month: 'all',
    year: 'all',
  });
  const [viewType, setViewType] = useState<'all' | 'sales' | 'purchase'>('all');

  // Extract unique Channels, Months, Years from both datasets
  const channels = useMemo(() => {
    const set = new Set<string>();
    salesData.forEach((s) => s.Channel && set.add(s.Channel.trim()));
    purchaseData.forEach((p) => p.Channel && set.add(p.Channel.trim()));
    return Array.from(set).sort();
  }, [salesData, purchaseData]);

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
    return Array.from(set).sort((a, b) => {
      const tA = parseMonthTimestamp(a);
      const tB = parseMonthTimestamp(b);
      if (tA && tB) return tA - tB;
      return a.localeCompare(b);
    });
  }, [salesData, purchaseData]);

  const yearsList = useMemo(() => {
    const set = new Set<string>();
    monthsList.forEach((m) => {
      const match = m.match(/\d{4}/);
      if (match) set.add(match[0]);
    });
    return Array.from(set).sort();
  }, [monthsList]);

  // Filter Data
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

  // Outstanding calculations
  const salesOutstanding = useMemo(() => {
    let invoicesCount = 0;
    let creditNotesCount = 0;
    let paidCount = 0;
    let overdueCount = 0;
    let totalOutstanding = 0;
    const items = [];

    for (const s of filteredSales) {
      const bal = Number(s.Outstanding_Balance) || 0;
      const rawStatus = String(s.Document_Status || s.Status || s['Final Status'] || '').trim();
      const statusLower = rawStatus.toLowerCase();
      const days = calculateDaysOld(s.Date);

      // Determine document status
      let docStatus = 'Overdue';
      if (statusLower.includes('overdue')) {
        docStatus = 'Overdue';
      } else if (statusLower.includes('paid') && bal === 0) {
        docStatus = 'Paid';
      } else if (statusLower.includes('pending') && days === 0) {
        docStatus = 'Pending';
      } else if (rawStatus && !statusLower.includes('paid')) {
        docStatus = rawStatus;
      } else {
        docStatus = days > 0 ? 'Overdue' : 'Pending';
      }

      if (docStatus === 'Paid' || statusLower.includes('paid')) paidCount++;
      if (docStatus === 'Overdue' || statusLower.includes('overdue')) overdueCount++;

      if (bal !== 0) { // Outstanding value exists and not zero
        totalOutstanding += bal;
        const type = String(s.Transaction_Type || '').toLowerCase().trim();

        if (type.includes('invoice') || type === 'sale' || type === 'sales') {
          invoicesCount++;
        } else if (type.includes('credit note') || type.includes('return')) {
          creditNotesCount++;
        } else {
          invoicesCount++; // default to invoice if unknown
        }

        items.push({
          type: 'Sales',
          date: s.Date,
          days: days,
          amount: s.Net_Amount,
          outstanding: bal,
          transType: s.Transaction_Type || 'Invoice',
          ref: s.Reference_Number,
          status: docStatus,
          entity: s.Entity_Number,
          transDetail: s.Transaction_Details || '-'
        });
      }
    }

    return { invoicesCount, creditNotesCount, paidCount, overdueCount, totalOutstanding, items };
  }, [filteredSales]);

  const purchaseOutstanding = useMemo(() => {
    let billsCount = 0;
    let debitNotesCount = 0;
    let paidCount = 0;
    let overdueCount = 0;
    let totalOutstanding = 0;
    const items = [];

    for (const p of filteredPurchase) {
      const bal = Number(p.Outstanding_Balance) || 0;
      const rawStatus = String(p.Document_Status || p.Status || p['Final Status'] || '').trim();
      const statusLower = rawStatus.toLowerCase();
      const days = calculateDaysOld(p.Date);

      // Determine document status
      let docStatus = 'Overdue';
      if (statusLower.includes('overdue')) {
        docStatus = 'Overdue';
      } else if (statusLower.includes('paid') && bal === 0) {
        docStatus = 'Paid';
      } else if (statusLower.includes('pending') && days === 0) {
        docStatus = 'Pending';
      } else if (rawStatus && !statusLower.includes('paid')) {
        docStatus = rawStatus;
      } else {
        docStatus = days > 0 ? 'Overdue' : 'Pending';
      }

      if (docStatus === 'Paid' || statusLower.includes('paid')) paidCount++;
      if (docStatus === 'Overdue' || statusLower.includes('overdue')) overdueCount++;

      if (bal !== 0) {
        totalOutstanding += bal;
        const type = String(p.Transaction_Type || '').toLowerCase().trim();

        if (type.includes('bill') || type === 'purchase') {
          billsCount++;
        } else if (type.includes('debit note') || type.includes('return')) {
          debitNotesCount++;
        } else {
          billsCount++; // default to bill
        }

        items.push({
          type: 'Purchase',
          date: p.Date,
          days: days,
          amount: p.Net_Amount,
          outstanding: bal,
          transType: p.Transaction_Type || 'Bill',
          ref: p.Reference_Number,
          status: docStatus,
          entity: p.Entity_Number,
          transDetail: p.Transaction_Details || '-'
        });
      }
    }

    return { billsCount, debitNotesCount, paidCount, overdueCount, totalOutstanding, items };
  }, [filteredPurchase]);

  // Combine and sort ageing items
  const ageingItems = useMemo(() => {
    let items: any[] = [];
    if (viewType === 'all' || viewType === 'sales') {
      items.push(...salesOutstanding.items);
    }
    if (viewType === 'all' || viewType === 'purchase') {
      items.push(...purchaseOutstanding.items);
    }
    return items.sort((a, b) => b.days - a.days);
  }, [salesOutstanding.items, purchaseOutstanding.items, viewType]);

  // Ageing Buckets for chart
  const ageingBuckets = useMemo(() => {
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const item of ageingItems) {
      if (item.days <= 30) buckets['0-30'] += Math.abs(item.outstanding);
      else if (item.days <= 60) buckets['31-60'] += Math.abs(item.outstanding);
      else if (item.days <= 90) buckets['61-90'] += Math.abs(item.outstanding);
      else buckets['90+'] += Math.abs(item.outstanding);
    }
    return buckets;
  }, [ageingItems]);

  const barChartData = {
    labels: ['0-30 Days', '31-60 Days', '61-90 Days', '90+ Days'],
    datasets: [
      {
        label: 'Outstanding Amount',
        data: [ageingBuckets['0-30'], ageingBuckets['31-60'], ageingBuckets['61-90'], ageingBuckets['90+']],
        backgroundColor: '#eab308', // yellow-500
        borderRadius: 4,
      }
    ]
  };

  const doughnutData = {
    labels: ['Sales Outstanding', 'Purchase Outstanding'],
    datasets: [
      {
        data: [Math.abs(salesOutstanding.totalOutstanding), Math.abs(purchaseOutstanding.totalOutstanding)],
        backgroundColor: ['#3b82f6', '#ef4444'],
        borderWidth: 0,
      }
    ]
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-end justify-between">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Year</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 outline-none focus:border-[#2d5a5a]"
              value={filters.year}
              onChange={(e) => setFilters((prev) => ({ ...prev, year: e.target.value, month: 'all' }))}
            >
              <option value="all">All Years</option>
              {yearsList.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Month</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 outline-none focus:border-[#2d5a5a]"
              value={filters.month}
              onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))}
            >
              <option value="all">All Months</option>
              {monthsList
                .filter((m) => filters.year === 'all' || m.includes(filters.year))
                .map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Channel / Marketplace</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 outline-none focus:border-[#2d5a5a]"
              value={filters.channel}
              onChange={(e) => setFilters((prev) => ({ ...prev, channel: e.target.value }))}
            >
              <option value="all">All Channels</option>
              {channels.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        
        {/* View Toggle */}
        <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
          <button
            onClick={() => setViewType('all')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
              viewType === 'all' ? 'bg-white text-[#1a3a3a] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            All Outstanding
          </button>
          <button
            onClick={() => setViewType('sales')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
              viewType === 'sales' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sales
          </button>
          <button
            onClick={() => setViewType('purchase')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
              viewType === 'purchase' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Purchase
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className={`grid grid-cols-1 ${viewType === 'all' ? 'md:grid-cols-2' : 'md:grid-cols-1'} gap-4`}>
        {(viewType === 'all' || viewType === 'sales') && (
          <div className="bg-white p-5 rounded-xl shadow-sm border border-blue-100 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-600 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span> Sales Outstanding
            </h3>
            <div className="text-3xl font-bold text-[#1a3a3a] mb-6">
              ₹ {salesOutstanding.totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-gray-100 pt-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">Invoices</div>
              <div className="text-lg font-bold text-gray-800">{salesOutstanding.invoicesCount}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Credit Notes</div>
              <div className="text-lg font-bold text-gray-800">{salesOutstanding.creditNotesCount}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1 text-green-600">Status: Paid</div>
              <div className="text-lg font-bold text-gray-800">{salesOutstanding.paidCount}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1 text-red-600">Status: Overdue</div>
              <div className="text-lg font-bold text-gray-800">{salesOutstanding.overdueCount}</div>
            </div>
          </div>
          </div>
        )}

        {(viewType === 'all' || viewType === 'purchase') && (
          <div className="bg-white p-5 rounded-xl shadow-sm border border-red-100 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-600 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span> Purchase Outstanding
              </h3>
              <div className="text-3xl font-bold text-[#1a3a3a] mb-6">
                ₹ {purchaseOutstanding.totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-gray-100 pt-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Bills</div>
                <div className="text-lg font-bold text-gray-800">{purchaseOutstanding.billsCount}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Debit Notes</div>
                <div className="text-lg font-bold text-gray-800">{purchaseOutstanding.debitNotesCount}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1 text-green-600">Status: Paid</div>
                <div className="text-lg font-bold text-gray-800">{purchaseOutstanding.paidCount}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1 text-red-600">Status: Overdue</div>
                <div className="text-lg font-bold text-gray-800">{purchaseOutstanding.overdueCount}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className={`grid grid-cols-1 ${viewType === 'all' ? 'md:grid-cols-3' : 'md:grid-cols-1'} gap-4`}>
        <div className={`bg-white p-4 rounded-xl shadow-sm border border-gray-100 ${viewType === 'all' ? 'md:col-span-2' : ''}`}>
          <h3 className="text-sm font-bold text-gray-700 mb-4">📊 Outstanding Ageing (Days)</h3>
          <div className="h-64">
            <Bar
              data={barChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
                  x: { grid: { display: false } }
                }
              }}
            />
          </div>
        </div>
        {viewType === 'all' && (
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-4">Pie Chart Overview</h3>
            <div className="h-64 flex justify-center pb-4">
              <Doughnut
                data={doughnutData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                  },
                  cutout: '70%',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Ageing Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-sm font-bold text-gray-700">⏳ Outstanding Ageing List</h3>
          <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">
            Total {ageingItems.length} records
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-gray-200 text-gray-500 text-xs text-left">
              <tr>
                <th className="py-3 px-4 font-semibold">Type</th>
                <th className="py-3 px-4 font-semibold">Trans. Type</th>
                <th className="py-3 px-4 font-semibold">Ref Number</th>
                <th className="py-3 px-4 font-semibold">Entity Number</th>
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Transaction Detail</th>
                <th className="py-3 px-4 font-semibold text-right">Net Amount</th>
                <th className="py-3 px-4 font-semibold text-right">Outstanding</th>
                <th className="py-3 px-4 font-semibold text-center">Days Old</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ageingItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-500 bg-gray-50/50">
                    No outstanding records found for the selected filters.
                  </td>
                </tr>
              ) : (
                ageingItems.map((item, idx) => {
                  const isOverdue = String(item.status || '').toLowerCase().includes('overdue');
                  return (
                    <tr key={idx} className={`hover:bg-gray-50/80 transition-colors ${isOverdue ? 'bg-red-50/50' : ''}`}>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.type === 'Sales' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-red-50 text-red-600 border border-red-100'
                        }`}>
                          {item.type}
                        </span>
                      </td>
                    <td className="py-2.5 px-4 text-gray-600 truncate max-w-[120px]" title={item.transType}>{item.transType}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-gray-500">{item.ref || '-'}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-gray-500">{item.entity || '-'}</td>
                    <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap">{item.date}</td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        isOverdue ? 'bg-red-100 text-red-800 border-red-300' :
                        String(item.status || '').toLowerCase().includes('paid') ? 'bg-green-50 text-green-700 border-green-200' :
                        String(item.status || '').toLowerCase().includes('pending') ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                        'bg-gray-50 text-gray-600 border-gray-200'
                      }`}>
                        {item.status || 'Pending'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-medium text-gray-800 truncate max-w-[200px]" title={item.transDetail}>{item.transDetail}</td>
                    <td className="py-2.5 px-4 text-right text-gray-600">₹ {item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-[#1a3a3a]">
                      ₹ {item.outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        item.days > 90 ? 'bg-red-100 text-red-800' :
                        item.days > 60 ? 'bg-orange-100 text-orange-700' :
                        item.days > 30 ? 'bg-yellow-100 text-yellow-700' :
                        item.days < 0 ? 'bg-gray-100 text-gray-600' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {item.days} Days
                      </span>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
