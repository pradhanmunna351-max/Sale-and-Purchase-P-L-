import React, { useMemo, useState } from 'react';
import { PaymentRecord } from '../types';
import { standardizeMonth, parseMonthTimestamp } from '../utils/monthUtils';
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react';

interface PaymentReceivedDashboardProps {
  paymentData: PaymentRecord[];
}

export function PaymentReceivedDashboard({ paymentData }: PaymentReceivedDashboardProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 50;

  // Derive unique months
  const availableMonths = useMemo(() => {
    const mSet = new Set<string>();
    paymentData.forEach(p => {
      const m = standardizeMonth(p.Month);
      if (m) mSet.add(m);
    });
    return Array.from(mSet).sort((a, b) => parseMonthTimestamp(b) - parseMonthTimestamp(a));
  }, [paymentData]);

  const filteredData = useMemo(() => {
    return paymentData.filter(p => {
      if (selectedMonth !== 'all' && standardizeMonth(p.Month) !== selectedMonth) return false;
      return true;
    });
  }, [paymentData, selectedMonth]);

  // Adjust pagination
  const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredData.slice(start, start + rowsPerPage);
  }, [filteredData, currentPage, rowsPerPage]);

  const channelWiseSummary = useMemo(() => {
    const summary: Record<string, number> = {};
    filteredData.forEach((p) => {
      const channel = p.Channel || 'Unknown';
      summary[channel] = (summary[channel] || 0) + (Number(p.Amount) || 0);
    });
    return Object.entries(summary).sort((a, b) => b[1] - a[1]);
  }, [filteredData]);

  const totalAmount = useMemo(() => {
    return channelWiseSummary.reduce((acc, curr) => acc + curr[1], 0);
  }, [channelWiseSummary]);

  // Reset page when filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedMonth]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-500" />
          <span className="text-sm font-bold text-gray-700">Filter by Month:</span>
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="p-2 border border-gray-300 rounded-md text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
        >
          <option value="all">All Months</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        
        <div className="ml-auto text-sm text-gray-500 font-medium">
          Showing {filteredData.length} records
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 font-bold uppercase mb-1">Total Payment Received</p>
            <p className="text-2xl font-black text-emerald-600 tracking-tight">₹ {totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="h-12 w-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 text-xl font-bold">
            ₹
          </div>
        </div>
      </div>

      {/* Channel-wise Split */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Channel-wise Payment Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channelWiseSummary.map(([channel, amount]) => (
            <div key={channel} className="bg-gray-50 p-4 rounded-lg border border-gray-200 flex justify-between items-center">
              <span className="font-bold text-gray-700">{channel}</span>
              <span className="font-extrabold text-emerald-600">₹ {amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          ))}
          {channelWiseSummary.length === 0 && (
            <div className="text-gray-500 col-span-full">No channel data available.</div>
          )}
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <h2 className="text-lg font-bold text-gray-800">Recent Payments</h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm font-medium text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        <div className="overflow-auto rounded-lg">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 border-b text-gray-600">Payment No</th>
                <th className="p-3 border-b text-gray-600">Bank Entry Date</th>
                <th className="p-3 border-b text-gray-600">Month</th>
                <th className="p-3 border-b text-gray-600">Channel</th>
                <th className="p-3 border-b text-gray-600">Description</th>
                <th className="p-3 border-b text-gray-600 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((p, i) => (
                <tr key={i} className="border-b hover:bg-gray-50/50 transition-colors">
                  <td className="p-3 font-medium text-gray-800">{p.Payment_No}</td>
                  <td className="p-3 text-gray-600">{p.Bank_Entry_Date}</td>
                  <td className="p-3 text-gray-600">{p.Month}</td>
                  <td className="p-3 text-gray-600">{p.Channel}</td>
                  <td className="p-3 text-gray-600 max-w-xs truncate" title={p.Description}>{p.Description}</td>
                  <td className="p-3 font-bold text-emerald-600 text-right">₹ {(Number(p.Amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {paginatedData.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">No payments recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

