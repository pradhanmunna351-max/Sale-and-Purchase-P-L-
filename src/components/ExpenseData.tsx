import React, { useState, useMemo } from 'react';
import { Trash2, RefreshCw, Wrench, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { ExpenseEntry } from '../types';
import { standardizeMonth, parseMonthTimestamp } from '../utils/monthUtils';

interface ExpenseDataProps {
  entries: ExpenseEntry[];
  onDelete: (rowIndex: number, mkt: string, inv: string) => void;
  onRefresh: () => void;
  onClearAll: () => void;
  onResetSheet: () => void;
}

export const ExpenseData: React.FC<ExpenseDataProps> = ({
  entries,
  onDelete,
  onRefresh,
  onClearAll,
  onResetSheet,
}) => {
  const [filterMkt, setFilterMkt] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterInvoice, setFilterInvoice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const marketplaces = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.marketplace && set.add(e.marketplace));
    return Array.from(set).sort();
  }, [entries]);

  const months = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => {
      const std = standardizeMonth(e.month);
      if (std) set.add(std);
    });
    return Array.from(set).sort((a, b) => {
      const tA = parseMonthTimestamp(a);
      const tB = parseMonthTimestamp(b);
      if (tA && tB) return tA - tB;
      return a.localeCompare(b);
    });
  }, [entries]);

  const invoices = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => e.invoiceNumber && set.add(e.invoiceNumber));
    return Array.from(set).sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const matchMkt = !filterMkt || e.marketplace === filterMkt;
      const stdM = standardizeMonth(e.month);
      const matchMonth = !filterMonth || stdM === filterMonth;
      const matchInv = !filterInvoice || e.invoiceNumber === filterInvoice;
      
      let matchSearch = true;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        matchSearch =
          (e.marketplace || '').toLowerCase().includes(q) ||
          (e.month || '').toLowerCase().includes(q) ||
          (e.invoiceNumber || '').toLowerCase().includes(q) ||
          (e.name || '').toLowerCase().includes(q) ||
          (e.desc || '').toLowerCase().includes(q);
      }

      return matchMkt && matchMonth && matchInv && matchSearch;
    });
  }, [entries, filterMkt, filterMonth, filterInvoice, searchQuery]);

  const totalRecords = filteredEntries.length;
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalRecords / pageSize)) : 1;
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedEntries = useMemo(() => {
    if (pageSize <= 0) return filteredEntries;
    const start = (validPage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, validPage, pageSize]);

  const generatePageNumbers = (current: number, total: number) => {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    pages.push(1);
    if (current > 3) pages.push('...');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  };

  const formatRupee = (val: number) =>
    '₹ ' + Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-200 flex-wrap gap-2">
        <h2 className="text-base font-bold text-[#1a3a3a]">📋 Expense Data</h2>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterMkt}
            onChange={(e) => {
              setFilterMkt(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-700"
          >
            <option value="">All Marketplaces</option>
            {marketplaces.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={filterMonth}
            onChange={(e) => {
              setFilterMonth(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-700"
          >
            <option value="">All Months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={filterInvoice}
            onChange={(e) => {
              setFilterInvoice(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-700"
          >
            <option value="">All Invoices</option>
            {invoices.map((inv) => (
              <option key={inv} value={inv}>
                {inv}
              </option>
            ))}
          </select>

          <span className="bg-gray-100 px-3 py-1 rounded-full text-xs font-semibold text-[#1a3a3a]">
            {filteredEntries.length} rows
          </span>
        </div>
      </div>

      {/* Search & Pagination Settings Bar */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search expenses by brand, description, invoice..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:ring-1 focus:ring-[#1a3a3a] focus:outline-none"
            />
          </div>
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="text-xs text-gray-500 hover:text-gray-800 underline px-1"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-600 font-medium">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-gray-300 rounded-md px-2 py-1 bg-white font-semibold text-gray-700 focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
              <option value={0}>All ({totalRecords})</option>
            </select>
          </div>

          <div className="text-gray-600 font-medium">
            Showing{' '}
            <span className="font-bold text-[#1a3a3a]">
              {totalRecords === 0
                ? 0
                : pageSize === 0
                ? 1
                : (validPage - 1) * pageSize + 1}
            </span>{' '}
            to{' '}
            <span className="font-bold text-[#1a3a3a]">
              {pageSize === 0
                ? totalRecords
                : Math.min(validPage * pageSize, totalRecords)}
            </span>{' '}
            of <span className="font-bold text-[#1a3a3a]">{totalRecords}</span> records
          </div>
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[450px] border border-gray-200 rounded-lg">
        <table className="w-full text-xs text-center border-collapse min-w-[900px]">
          <thead className="bg-[#1a3a3a] text-white sticky top-0 z-10">
            <tr>
              <th className="py-2.5 px-3">Marketplace</th>
              <th className="py-2.5 px-3">Month</th>
              <th className="py-2.5 px-3">Invoice Number</th>
              <th className="py-2.5 px-3">Brand</th>
              <th className="py-2.5 px-3">Expense Type</th>
              <th className="py-2.5 px-3">Invoice Value</th>
              <th className="py-2.5 px-3">Credit Note</th>
              <th className="py-2.5 px-3">Net Value</th>
              <th className="py-2.5 px-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedEntries.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-gray-500">
                  <div className="text-3xl mb-1">📭</div>
                  <p className="font-medium">Abhi koi entry nahi hai</p>
                  <p className="text-[11px] text-gray-400">
                    Manual Entry tab se naya data add karein
                  </p>
                </td>
              </tr>
            ) : (
              paginatedEntries.map((e) => {
                const net = e.invoice - e.credit;
                return (
                  <tr key={e.rowIndex} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-2 px-3">
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                        {e.marketplace}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                        {e.month}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-medium text-gray-700">
                      {e.invoiceNumber || '-'}
                    </td>
                    <td className="py-2 px-3 font-medium text-gray-700">
                      {e.name || '-'}
                    </td>
                    <td className="py-2 px-3 text-gray-800">{e.desc}</td>
                    <td className="py-2 px-3 text-[#e74c3c] font-semibold">
                      {e.invoice > 0 ? `- ${formatRupee(e.invoice)}` : '₹ 0.00'}
                    </td>
                    <td className="py-2 px-3 text-[#27ae60] font-semibold">
                      {e.credit > 0 ? `+ ${formatRupee(e.credit)}` : '₹ 0.00'}
                    </td>
                    <td className={`py-2 px-3 font-bold ${net < 0 ? 'text-[#e74c3c]' : 'text-[#27ae60]'}`}>
                      {formatRupee(net)}
                    </td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => onDelete(e.rowIndex, e.marketplace, e.invoiceNumber)}
                        title="Delete entry"
                        className="text-red-500 hover:text-red-700 hover:scale-125 transition-all p-1"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {pageSize > 0 && totalPages > 1 && (
        <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-200 flex-wrap gap-2 text-xs">
          <span className="text-gray-500">
            Page <span className="font-bold text-gray-800">{validPage}</span> of{' '}
            <span className="font-bold text-gray-800">{totalPages}</span>
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={validPage <= 1}
              className="p-1.5 border border-gray-300 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 bg-white"
              title="First Page"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={validPage <= 1}
              className="p-1.5 border border-gray-300 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 bg-white"
              title="Previous Page"
            >
              <ChevronLeft size={14} />
            </button>

            {generatePageNumbers(validPage, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`ell-${i}`} className="px-1 text-gray-400">
                  ...
                </span>
              ) : (
                <button
                  key={`page-${p}`}
                  onClick={() => setCurrentPage(Number(p))}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                    validPage === p
                      ? 'bg-[#1a3a3a] text-white border-[#1a3a3a] shadow-sm'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border-gray-300'
                  }`}
                >
                  {p}
                </button>
              )
            )}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={validPage >= totalPages}
              className="p-1.5 border border-gray-300 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 bg-white"
              title="Next Page"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={validPage >= totalPages}
              className="p-1.5 border border-gray-300 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 bg-white"
              title="Last Page"
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-4 flex-wrap">
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-[#2d5a5a] text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw size={13} /> Refresh
        </button>
        <button
          onClick={onResetSheet}
          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Wrench size={13} /> Reset Sheet
        </button>
        <button
          onClick={onClearAll}
          className="px-3 py-1.5 bg-[#e74c3c] hover:bg-[#c0392b] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors shadow-sm"
        >
          <Trash2 size={13} /> Clear All
        </button>
      </div>
    </div>
  );
};
