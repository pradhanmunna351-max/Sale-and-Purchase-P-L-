import React, { useState, useMemo } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import { ExpenseEntry, FilterState } from '../types';

interface SummaryTabProps {
  expenses: ExpenseEntry[];
  onRefresh: () => void;
}

export const SummaryTab: React.FC<SummaryTabProps> = ({ expenses, onRefresh }) => {
  const [filters, setFilters] = useState<FilterState>({
    channel: 'all',
    month: 'all',
    year: 'all',
  });

  const channelsList = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach((e) => e.marketplace && set.add(e.marketplace));
    return Array.from(set).sort();
  }, [expenses]);

  const monthsList = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach((e) => e.month && set.add(e.month));
    return Array.from(set).sort();
  }, [expenses]);

  const yearsList = useMemo(() => {
    const set = new Set<string>();
    expenses.forEach((e) => {
      if (e.month) {
        const match = e.month.match(/\d{4}/);
        if (match) set.add(match[0]);
      }
    });
    return Array.from(set).sort();
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      const matchChannel =
        filters.channel === 'all' ||
        String(item.marketplace).trim() === String(filters.channel).trim();
      const matchMonth =
        filters.month === 'all' ||
        String(item.month).trim() === String(filters.month).trim();
      const matchYear =
        filters.year === 'all' ||
        (item.month && item.month.includes(filters.year));
      return matchChannel && matchMonth && matchYear;
    });
  }, [expenses, filters]);

  // Summaries
  const mktSummary = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach((e) => {
      const net = e.invoice - e.credit;
      map[e.marketplace || 'Unknown'] = (map[e.marketplace || 'Unknown'] || 0) + net;
    });
    return map;
  }, [filteredExpenses]);

  const brandSummary = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach((e) => {
      const net = e.invoice - e.credit;
      map[e.name || 'Unknown'] = (map[e.name || 'Unknown'] || 0) + net;
    });
    return map;
  }, [filteredExpenses]);

  const catSummary = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach((e) => {
      const net = e.invoice - e.credit;
      map[e.desc || 'Unknown'] = (map[e.desc || 'Unknown'] || 0) + net;
    });
    return map;
  }, [filteredExpenses]);

  const formatRupee = (val: number) =>
    '₹ ' + Math.round(val).toLocaleString('en-IN');

  const renderCardList = (dataMap: Record<string, number>) => {
    const keys = Object.keys(dataMap).sort((a, b) => Math.abs(dataMap[b]) - Math.abs(dataMap[a]));
    if (keys.length === 0) {
      return <p className="text-xs text-gray-400 p-2">No data available</p>;
    }
    const total = keys.reduce((acc, k) => acc + dataMap[k], 0);

    return (
      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
        {keys.map((key) => (
          <div
            key={key}
            className="flex justify-between items-center text-xs py-1 border-b border-gray-100"
          >
            <span className="text-gray-700 font-medium truncate max-w-[150px]">
              {key}
            </span>
            <span
              className={`font-semibold ${
                dataMap[key] < 0 ? 'text-red-500' : 'text-emerald-600'
              }`}
            >
              {formatRupee(dataMap[key])}
            </span>
          </div>
        ))}
        <div className="flex justify-between items-center text-xs font-bold pt-2 border-t border-gray-300 text-[#1a3a3a]">
          <span>Total</span>
          <span className={total < 0 ? 'text-red-500' : 'text-[#1a3a3a]'}>
            {formatRupee(total)}
          </span>
        </div>
      </div>
    );
  };

  // Chart Data
  const mktKeys = Object.keys(mktSummary);
  const mktValues = mktKeys.map((k) => mktSummary[k]);

  const catKeys = Object.keys(catSummary).slice(0, 8);
  const catValues = catKeys.map((k) => catSummary[k]);

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-200 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-[#1a3a3a]">📊 Summary (Live)</h2>
          <span className="text-[11px] text-gray-500">Expense Analysis</span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filters.channel}
            onChange={(e) => setFilters({ ...filters, channel: e.target.value })}
            className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-700"
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
            className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-700"
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
            className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-700"
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

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#f8fafc] border border-gray-200 rounded-lg p-3.5">
          <h4 className="text-xs font-bold text-center text-gray-700 mb-3 pb-1 border-b border-gray-200">
            Marketplace-wise Net Expense
          </h4>
          {renderCardList(mktSummary)}
        </div>

        <div className="bg-[#f8fafc] border border-gray-200 rounded-lg p-3.5">
          <h4 className="text-xs font-bold text-center text-gray-700 mb-3 pb-1 border-b border-gray-200">
            Brand-wise Net Expense
          </h4>
          {renderCardList(brandSummary)}
        </div>

        <div className="bg-[#f8fafc] border border-gray-200 rounded-lg p-3.5">
          <h4 className="text-xs font-bold text-center text-gray-700 mb-3 pb-1 border-b border-gray-200">
            Expense Type-wise Net Expense
          </h4>
          {renderCardList(catSummary)}
        </div>
      </div>

      {/* Summary Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-[#fafbfc] border border-gray-200 p-3.5 rounded-lg min-h-[280px]">
          <h4 className="text-xs font-semibold text-center text-gray-700 mb-2">
            📊 Marketplace-wise Expense
          </h4>
          <div className="h-[220px]">
            <Doughnut
              data={{
                labels: mktKeys,
                datasets: [
                  {
                    data: mktValues,
                    backgroundColor: [
                      '#3498db',
                      '#2ecc71',
                      '#e74c3c',
                      '#f39c12',
                      '#9b59b6',
                      '#1abc9c',
                      '#e67e22',
                    ],
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'right', labels: { font: { size: 10 } } },
                  datalabels: { display: false },
                },
              }}
            />
          </div>
        </div>

        <div className="bg-[#fafbfc] border border-gray-200 p-3.5 rounded-lg min-h-[280px]">
          <h4 className="text-xs font-semibold text-center text-gray-700 mb-2">
            📊 Expense Type-wise Expense
          </h4>
          <div className="h-[220px]">
            <Bar
              data={{
                labels: catKeys,
                datasets: [
                  {
                    label: 'Net Expense',
                    data: catValues,
                    backgroundColor: '#3498db',
                    borderRadius: 4,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  datalabels: { display: false },
                },
              }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-start">
        <button
          onClick={onRefresh}
          className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-[#2d5a5a] text-xs font-semibold rounded-md transition-colors"
        >
          🔄 Refresh Summary
        </button>
      </div>
    </div>
  );
};
