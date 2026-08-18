import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { Upload, Download, RotateCcw, Search, FileSpreadsheet, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { SalesRecord, FilterState } from '../types';
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
  ArcElement,
  ChartDataLabels
);

interface SalesDashboardProps {
  salesData: SalesRecord[];
  onBulkUpload?: (rows: any[][]) => Promise<boolean>;
  onResetSales?: () => void;
}

export const SalesDashboard: React.FC<SalesDashboardProps> = ({
  salesData,
  onBulkUpload,
  onResetSales,
}) => {
  const [activeView, setActiveView] = useState<'breakdown' | 'dashboard' | 'summary' | 'raw'>('breakdown');
  const [searchQuery, setSearchQuery] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [showUploader, setShowUploader] = useState(false);

  // Pagination states for Raw Records
  const [rawSearchQuery, setRawSearchQuery] = useState('');
  const [rawCurrentPage, setRawCurrentPage] = useState(1);
  const [rawPageSize, setRawPageSize] = useState<number>(25);

  const [filters, setFilters] = useState<FilterState>({
    channel: 'all',
    month: 'all',
    year: 'all',
  });

  const parseNum = (val: any) => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const str = String(val || '').replace(/[^0-9.-]/g, '').trim();
    const n = parseFloat(str);
    return isNaN(n) ? 0 : n;
  };

  // Helper to accurately classify each row without skipping ANY data
  const classifySalesRow = (item: SalesRecord) => {
    const transType = String(item.Transaction_Type || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const debit = parseNum(item.Debit);
    const credit = parseNum(item.Credit);
    const net = parseNum(item.Net_Amount);

    let isInvoice = false;
    let isReturn = false;

    if (transType.includes('credit') || transType.includes('return') || transType.includes('cn') || transType.includes('refund')) {
      isReturn = true;
    } else if (transType.includes('invoice') || transType.includes('inv') || transType.includes('debitnote') || transType === 'sale' || transType === 'sales') {
      isInvoice = true;
    } else {
      // Fallback based on Column J Credit (Invoice Value) vs Column I Debit (Credit Note / Return Value)
      if (credit > 0 && debit === 0) {
        isInvoice = true;
      } else if (debit > 0 && credit === 0) {
        isReturn = true;
      } else if (credit >= debit) {
        isInvoice = true;
      } else {
        isReturn = true;
      }
    }

    let grossSale = 0;
    let returnVal = 0;

    if (isInvoice) {
      grossSale = credit !== 0 ? Math.abs(credit) : (net !== 0 ? Math.abs(net) : Math.abs(debit));
    } else {
      returnVal = debit !== 0 ? Math.abs(debit) : (net !== 0 ? Math.abs(net) : Math.abs(credit));
    }

    return { isInvoice, isReturn, grossSale, returnVal };
  };

  const channelsList = useMemo(() => {
    const set = new Set<string>();
    salesData.forEach((s) => s.Channel && set.add(s.Channel));
    return Array.from(set).sort();
  }, [salesData]);

  const monthsList = useMemo(() => {
    const set = new Set<string>();
    salesData.forEach((s) => {
      const std = standardizeMonth(s.Month);
      if (std) set.add(std);
    });
    return Array.from(set).sort((a, b) => {
      const tA = parseMonthTimestamp(a);
      const tB = parseMonthTimestamp(b);
      if (tA && tB) return tA - tB;
      return a.localeCompare(b);
    });
  }, [salesData]);

  const yearsList = useMemo(() => {
    const set = new Set<string>();
    monthsList.forEach((m) => {
      const match = m.match(/\d{4}/);
      if (match) set.add(match[0]);
    });
    return Array.from(set).sort();
  }, [monthsList]);

  // Filtered Sales
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

  // High-level Totals across filtered sales
  const totals = useMemo(() => {
    let sales = 0;
    let returns = 0;

    filteredSales.forEach((item) => {
      const { isInvoice, grossSale, returnVal } = classifySalesRow(item);
      if (isInvoice) sales += grossSale;
      else returns += returnVal;
    });

    const netSales = sales - returns;
    const returnPercent = sales > 0 ? (returns / sales) * 100 : 0;

    return { sales, returns, netSales, returnPercent };
  }, [filteredSales]);

  // Primary Requested Feature: Month & Channel-Wise Total Sales, Return & Net Sales
  const monthChannelBreakdown = useMemo(() => {
    const map: Record<string, {
      month: string;
      channel: string;
      totalRows: number;
      invoiceCount: number;
      returnCount: number;
      grossSales: number;
      returns: number;
    }> = {};

    filteredSales.forEach((item) => {
      const month = standardizeMonth(item.Month) || 'Unassigned';
      const channel = String(item.Channel || 'Direct').trim();
      const key = `${month}||${channel}`;

      if (!map[key]) {
        map[key] = {
          month,
          channel,
          totalRows: 0,
          invoiceCount: 0,
          returnCount: 0,
          grossSales: 0,
          returns: 0,
        };
      }

      const { isInvoice, grossSale, returnVal } = classifySalesRow(item);
      map[key].totalRows += 1;
      if (isInvoice) {
        map[key].invoiceCount += 1;
        map[key].grossSales += grossSale;
      } else {
        map[key].returnCount += 1;
        map[key].returns += returnVal;
      }
    });

    const list = Object.values(map).map((agg) => {
      const netSales = agg.grossSales - agg.returns;
      const returnPct = agg.grossSales > 0 ? (agg.returns / agg.grossSales) * 100 : 0;
      return {
        ...agg,
        netSales,
        returnPct,
      };
    });

    return list.sort((a, b) => {
      const mComp = a.month.localeCompare(b.month);
      if (mComp !== 0) return mComp;
      return a.channel.localeCompare(b.channel);
    });
  }, [filteredSales]);

  // Grand totals for Month & Channel Breakdown table
  const breakdownGrandTotal = useMemo(() => {
    let totalInvoices = 0;
    let totalReturnsCount = 0;
    let grossSales = 0;
    let returns = 0;

    monthChannelBreakdown.forEach((r) => {
      totalInvoices += r.invoiceCount;
      totalReturnsCount += r.returnCount;
      grossSales += r.grossSales;
      returns += r.returns;
    });

    const netSales = grossSales - returns;
    const returnPct = grossSales > 0 ? (returns / grossSales) * 100 : 0;

    return { totalInvoices, totalReturnsCount, grossSales, returns, netSales, returnPct };
  }, [monthChannelBreakdown]);

  // MoM Data
  const momData = useMemo(() => {
    const map: Record<string, { sales: number; returns: number }> = {};
    filteredSales.forEach((item) => {
      const m = standardizeMonth(item.Month) || 'Unknown';
      if (!map[m]) map[m] = { sales: 0, returns: 0 };
      const { isInvoice, grossSale, returnVal } = classifySalesRow(item);
      if (isInvoice) map[m].sales += grossSale;
      else map[m].returns += returnVal;
    });

    const labels = Object.keys(map).sort((a, b) => {
      const tA = parseMonthTimestamp(a);
      const tB = parseMonthTimestamp(b);
      if (tA && tB) return tA - tB;
      return a.localeCompare(b);
    });
    const salesArr = labels.map((l) => map[l].sales);
    const returnArr = labels.map((l) => map[l].returns);
    const returnPctArr = labels.map((l) =>
      map[l].sales > 0 ? (map[l].returns / map[l].sales) * 100 : 0
    );

    return { labels, salesArr, returnArr, returnPctArr };
  }, [filteredSales]);

  // Top 5 Transaction Details
  const top5Data = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSales.forEach((item) => {
      const detail = item.Transaction_Details || 'N/A';
      const { isInvoice, grossSale } = classifySalesRow(item);
      if (isInvoice) {
        map[detail] = (map[detail] || 0) + grossSale;
      }
    });

    const sorted = Object.keys(map)
      .map((k) => ({ label: k, value: map[k] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return {
      labels: sorted.map((s) => s.label),
      values: sorted.map((s) => s.value),
    };
  }, [filteredSales]);

  // Channel Contribution Donut
  const channelContribution = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSales.forEach((item) => {
      const channel = item.Channel || 'Unknown';
      const { isInvoice, grossSale } = classifySalesRow(item);
      if (isInvoice) {
        map[channel] = (map[channel] || 0) + grossSale;
      }
    });

    const labels = Object.keys(map);
    const values = labels.map((l) => map[l]);
    const total = values.reduce((a, b) => a + b, 0);

    return { labels, values, total };
  }, [filteredSales]);

  // Outstanding Data (Month-wise & Status-wise)
  const outstandingData = useMemo(() => {
    const map: Record<string, { paid: number; open: number }> = {};
    filteredSales.forEach((item) => {
      const m = standardizeMonth(item.Month) || 'Unknown';
      const status = String(item['Final Status'] || item.Status || item.Document_Status || item['Document Status'] || '').toLowerCase().trim();
      if (!map[m]) map[m] = { paid: 0, open: 0 };

      const { grossSale, returnVal } = classifySalesRow(item);
      const val = grossSale > 0 ? grossSale : returnVal;

      if (status.includes('paid') || status.includes('closed')) map[m].paid += val;
      else map[m].open += val;
    });

    const labels = Object.keys(map).sort((a, b) => {
      const tA = parseMonthTimestamp(a);
      const tB = parseMonthTimestamp(b);
      if (tA && tB) return tA - tB;
      return a.localeCompare(b);
    });
    return {
      labels,
      paid: labels.map((l) => map[l].paid),
      open: labels.map((l) => map[l].open),
    };
  }, [filteredSales]);

  // Summary Table Data
  const summaryTable = useMemo(() => {
    const map: Record<string, { sales: number; returns: number }> = {};
    filteredSales.forEach((item) => {
      const detail = item.Transaction_Details || 'N/A';
      if (!map[detail]) map[detail] = { sales: 0, returns: 0 };
      const { isInvoice, grossSale, returnVal } = classifySalesRow(item);
      if (isInvoice) map[detail].sales += grossSale;
      else map[detail].returns += returnVal;
    });

    return Object.keys(map).map((k) => {
      const sales = map[k].sales;
      const returns = map[k].returns;
      const net = sales - returns;
      const returnPct = sales > 0 ? (returns / sales) * 100 : 0;
      return { detail: k, sales, returns, net, returnPct };
    });
  }, [filteredSales]);

  // Raw Sales Search & Pagination
  const searchedRawSales = useMemo(() => {
    if (!rawSearchQuery.trim()) return filteredSales;
    const q = rawSearchQuery.toLowerCase().trim();
    return filteredSales.filter((item) => {
      return (
        String(item.Month || '').toLowerCase().includes(q) ||
        String(item.Channel || '').toLowerCase().includes(q) ||
        String(item.Transaction_Type || '').toLowerCase().includes(q) ||
        String(item.Account_Name || '').toLowerCase().includes(q) ||
        String(item.Reference_Number || '').toLowerCase().includes(q) ||
        String(item.Transaction_Details || '').toLowerCase().includes(q)
      );
    });
  }, [filteredSales, rawSearchQuery]);

  const rawTotalRecords = searchedRawSales.length;
  const rawTotalPages = rawPageSize > 0 ? Math.max(1, Math.ceil(rawTotalRecords / rawPageSize)) : 1;
  const validRawPage = Math.min(Math.max(1, rawCurrentPage), rawTotalPages);

  const paginatedRawSales = useMemo(() => {
    if (rawPageSize <= 0) return searchedRawSales;
    const start = (validRawPage - 1) * rawPageSize;
    return searchedRawSales.slice(start, start + rawPageSize);
  }, [searchedRawSales, validRawPage, rawPageSize]);

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

  const handleFileUpload = () => {
    if (!file || !onBulkUpload) return;
    setUploadStatus('Reading CSV file...');
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as string[][];
        if (!rows || rows.length < 2) {
          setUploadStatus('Error: CSV file is empty or missing data rows');
          return;
        }
        const dataRows = rows.slice(1);
        setUploadStatus(`Uploading ${dataRows.length} sales records...`);
        const success = await onBulkUpload(dataRows);
        if (success) {
          setUploadStatus(`✅ ${dataRows.length} sales records added successfully!`);
          setFile(null);
        } else {
          setUploadStatus('❌ Upload failed.');
        }
      },
      error: (err) => setUploadStatus(`Error parsing CSV: ${err.message}`),
    });
  };

  const handleDownloadSample = () => {
    const headers = [
      'Month', 'Channel', 'Date', 'Account_Name', 'Transaction_Details',
      'Transaction_Type', 'Reference_Number', 'Entity_Number', 'Debit', 'Credit',
      'Net_Amount', 'Status', 'Final Status', 'Return Type'
    ];
    const sampleRows = [
      ['Jan-2025', 'Ajio', '2025-01-05', 'Ajio Reliance Retail', 'Puma Activewear', 'Invoice', 'REF-AJ-101', 'ENT-01', '0', '185000', '185000', 'Completed', 'Paid', ''],
      ['Jan-2025', 'Ajio', '2025-01-18', 'Ajio Reliance Retail', 'Puma Activewear', 'CreditNote', 'CN-AJ-101', 'ENT-01', '24000', '0', '24000', 'Processed', 'Paid', 'Size Issue'],
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...sampleRows.map(e => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = 'Sales_Sample.csv';
    link.click();
  };

  const handleExportCSV = () => {
    if (!filteredSales.length) return;
    const headers = [
      'Month', 'Channel', 'Date', 'Account_Name', 'Transaction_Details',
      'Transaction_Type', 'Reference_Number', 'Entity_Number', 'Debit', 'Credit',
      'Net_Amount', 'Status', 'Final Status', 'Return Type'
    ];
    const rows = filteredSales.map(s => [
      s.Month, s.Channel, s.Date, s.Account_Name, s.Transaction_Details,
      s.Transaction_Type, s.Reference_Number, s.Entity_Number, s.Debit, s.Credit,
      s.Net_Amount, s.Status, s['Final Status'], s['Return Type']
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.map(x => `"${x || ''}"`).join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `Sales_Data_${filters.channel}_${filters.month}.csv`;
    link.click();
  };

  const filteredSummaryTable = useMemo(() => {
    if (!searchQuery.trim()) return summaryTable;
    const q = searchQuery.toLowerCase();
    return summaryTable.filter(r => r.detail.toLowerCase().includes(q));
  }, [summaryTable, searchQuery]);

  const formatRupee = (val: number) =>
    '₹ ' + Math.round(val).toLocaleString('en-IN');

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-200 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-[#1a3a3a] flex items-center gap-2">
            💰 Sales Dashboard
          </h2>
          <span className="text-[11px] text-gray-500">Sales Analysis with Outstanding</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowUploader(!showUploader)}
            className="px-2.5 py-1.5 bg-[#f0f7f7] hover:bg-[#e2f0f0] text-[#2d5a5a] text-xs font-semibold rounded-md flex items-center gap-1 border border-[#dce8e8] transition-all"
          >
            <Upload size={13} /> {showUploader ? 'Hide Uploader' : 'Upload Sales CSV'}
          </button>

          <button
            onClick={handleExportCSV}
            className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-md flex items-center gap-1 transition-all"
          >
            <Download size={13} /> Export CSV
          </button>

          <div className="flex bg-gray-100 p-0.5 rounded-lg flex-wrap gap-1">
            <button
              onClick={() => setActiveView('breakdown')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeView === 'breakdown'
                  ? 'bg-[#1a3a3a] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📅 Month & Channel Matrix
            </button>
            <button
              onClick={() => setActiveView('dashboard')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeView === 'dashboard'
                  ? 'bg-[#1a3a3a] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📊 Charts
            </button>
            <button
              onClick={() => setActiveView('summary')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeView === 'summary'
                  ? 'bg-[#1a3a3a] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📋 Details Summary
            </button>
            <button
              onClick={() => setActiveView('raw')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeView === 'raw'
                  ? 'bg-[#1a3a3a] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📑 Raw Records ({filteredSales.length})
            </button>
          </div>

          {/* Filter Section */}
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
      </div>

      {/* CSV Uploader Panel */}
      {showUploader && (
        <div className="bg-[#f0f7f7] border border-[#dce8e8] p-3 rounded-lg mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="font-semibold text-xs text-[#1a3a3a] flex items-center gap-1.5">
              <Upload size={14} /> Upload Sales CSV
            </span>
            <span className="text-[11px] text-gray-500">
              Format: Month, Channel, Date, Account_Name, Transaction_Details, Transaction_Type, Reference_Number, Entity_Number, Debit, Credit, Net_Amount, Status, Final Status, Return Type
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setUploadStatus('');
              }}
              className="text-xs text-gray-700 border border-gray-300 rounded-md p-1.5 bg-white flex-1 min-w-[200px]"
            />

            <button
              onClick={handleFileUpload}
              className="px-3 py-1.5 bg-[#27ae60] hover:bg-[#1e8449] text-white text-xs font-semibold rounded-md flex items-center gap-1 transition-all shadow-sm"
            >
              <Upload size={13} /> Upload Sales
            </button>

            <button
              onClick={handleDownloadSample}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-md flex items-center gap-1 transition-all"
            >
              <Download size={13} /> Download Sample CSV
            </button>

            {onResetSales && (
              <button
                onClick={onResetSales}
                className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-semibold rounded-md flex items-center gap-1 transition-all"
              >
                <RotateCcw size={13} /> Reset Default Data
              </button>
            )}
          </div>

          {uploadStatus && (
            <div className="text-xs font-semibold mt-2 text-[#2d5a5a]">
              {uploadStatus}
            </div>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-[#f8fafc] p-3.5 rounded-lg border border-gray-200 border-l-4 border-l-[#3498db]">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Total Sales
          </div>
          <div className="text-xl font-extrabold text-[#1a3a3a] mt-1">
            {formatRupee(totals.sales)}
          </div>
        </div>

        <div className="bg-[#f8fafc] p-3.5 rounded-lg border border-gray-200 border-l-4 border-l-[#e74c3c]">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Total Return
          </div>
          <div className="text-xl font-extrabold text-[#e74c3c] mt-1">
            {formatRupee(totals.returns)}
          </div>
        </div>

        <div className="bg-[#f8fafc] p-3.5 rounded-lg border border-gray-200 border-l-4 border-l-[#2d5a5a]">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Net Sales
          </div>
          <div className="text-xl font-extrabold text-[#27ae60] mt-1">
            {formatRupee(totals.netSales)}
          </div>
        </div>

        <div className="bg-[#f8fafc] p-3.5 rounded-lg border border-gray-200 border-l-4 border-l-[#f39c12]">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Return %
          </div>
          <div className="text-xl font-extrabold text-[#f39c12] mt-1">
            {totals.returnPercent.toFixed(2)}%
          </div>
        </div>
      </div>

      {activeView === 'breakdown' && (
        <div>
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#1a3a3a] flex items-center gap-2">
                📅 Month & Channel-Wise Sales & Return Matrix
              </h3>
              <p className="text-[11px] text-gray-500">
                Formula: Gross Sales (Invoice Credit Col J) - Return Value (CreditNote Debit Col I) = Net Sales. Nothing is omitted.
              </p>
            </div>
            <div className="text-xs font-medium text-gray-600 bg-gray-50 px-3 py-1 rounded border">
              Total Month/Channel Groups: <span className="font-bold text-[#1a3a3a]">{monthChannelBreakdown.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
            <table className="w-full text-xs text-center border-collapse min-w-[750px]">
              <thead className="bg-[#1a3a3a] text-white">
                <tr>
                  <th className="py-2.5 px-3 text-left">Month</th>
                  <th className="py-2.5 px-3 text-left">Channel / Marketplace</th>
                  <th className="py-2.5 px-3">Invoice Count</th>
                  <th className="py-2.5 px-3">Return Count</th>
                  <th className="py-2.5 px-3">Invoice Sales (₹) [Credit J]</th>
                  <th className="py-2.5 px-3">Credit Note Returns (₹) [Debit I]</th>
                  <th className="py-2.5 px-3">Net Sales (₹)</th>
                  <th className="py-2.5 px-3">Return %</th>
                </tr>
              </thead>
              <tbody>
                {monthChannelBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-gray-400">
                      No Sales Data available. Please paste your Google Sheet link in Settings to load live sales records.
                    </td>
                  </tr>
                ) : (
                  monthChannelBreakdown.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-left font-semibold text-gray-800">{row.month}</td>
                      <td className="py-2.5 px-3 text-left">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-teal-50 text-teal-800 border border-teal-100">
                          {row.channel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-gray-700">{row.invoiceCount}</td>
                      <td className="py-2.5 px-3 font-medium text-red-600">{row.returnCount}</td>
                      <td className="py-2.5 px-3 text-[#3498db] font-semibold">
                        {formatRupee(row.grossSales)}
                      </td>
                      <td className="py-2.5 px-3 text-[#e74c3c] font-semibold">
                        {formatRupee(row.returns)}
                      </td>
                      <td className="py-2.5 px-3 text-[#27ae60] font-bold text-sm">
                        {formatRupee(row.netSales)}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-gray-800">
                        <span className={`px-2 py-0.5 rounded text-[11px] ${row.returnPct > 20 ? 'bg-red-50 text-red-700 font-bold' : 'bg-gray-100 text-gray-700'}`}>
                          {row.returnPct.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {monthChannelBreakdown.length > 0 && (
                <tfoot className="bg-[#142d2d] text-white font-bold border-t-2 border-teal-600">
                  <tr>
                    <td colSpan={2} className="py-3 px-3 text-left">
                      GRAND TOTAL ({breakdownGrandTotal.totalInvoices} Invoices, {breakdownGrandTotal.totalReturnsCount} Returns)
                    </td>
                    <td className="py-3 px-3 text-gray-200">{breakdownGrandTotal.totalInvoices}</td>
                    <td className="py-3 px-3 text-red-200">{breakdownGrandTotal.totalReturnsCount}</td>
                    <td className="py-3 px-3 text-blue-300">{formatRupee(breakdownGrandTotal.grossSales)}</td>
                    <td className="py-3 px-3 text-red-300">{formatRupee(breakdownGrandTotal.returns)}</td>
                    <td className="py-3 px-3 text-emerald-300 text-sm">{formatRupee(breakdownGrandTotal.netSales)}</td>
                    <td className="py-3 px-3 text-amber-300">{breakdownGrandTotal.returnPct.toFixed(2)}%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {activeView === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Chart 1: Sales vs Return (MoM) */}
          <div className="bg-[#fafbfc] border border-gray-200 p-3.5 rounded-lg min-h-[300px]">
            <h4 className="text-xs font-semibold text-center text-gray-700">
              📊 Sales vs Return (Month on Month)
            </h4>
            <div className="text-[10px] text-center text-gray-500 mb-2">
              📈 Orange Line = Return %
            </div>
            <div className="h-[240px]">
              <Bar
                data={{
                  labels: momData.labels,
                  datasets: [
                    {
                      type: 'bar' as const,
                      label: 'Sales',
                      data: momData.salesArr,
                      backgroundColor: 'rgba(52, 152, 219, 0.7)',
                      borderColor: '#3498db',
                      borderWidth: 1,
                    },
                    {
                      type: 'bar' as const,
                      label: 'Return',
                      data: momData.returnArr,
                      backgroundColor: 'rgba(231, 76, 60, 0.7)',
                      borderColor: '#e74c3c',
                      borderWidth: 1,
                    },
                    {
                      type: 'line' as const,
                      label: 'Return %',
                      data: momData.returnPctArr,
                      borderColor: '#f39c12',
                      backgroundColor: 'rgba(243, 156, 18, 0.1)',
                      borderWidth: 2,
                      yAxisID: 'y1',
                    },
                  ] as any,
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'top', labels: { font: { size: 10 } } },
                    datalabels: { display: false },
                  },
                  scales: {
                    y: { beginAtZero: true },
                    y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } },
                  },
                }}
              />
            </div>
          </div>

          {/* Chart 2: Top 5 Transaction Details */}
          <div className="bg-[#fafbfc] border border-gray-200 p-3.5 rounded-lg min-h-[300px]">
            <h4 className="text-xs font-semibold text-center text-gray-700">
              🏆 Top 5 Transaction Details by Sales
            </h4>
            <div className="text-[10px] text-center text-gray-500 mb-2">
              💡 Hover on bars to see details
            </div>
            <div className="h-[240px]">
              <Bar
                data={{
                  labels: top5Data.labels,
                  datasets: [
                    {
                      label: 'Sales',
                      data: top5Data.values,
                      backgroundColor: [
                        '#3498db',
                        '#2ecc71',
                        '#f39c12',
                        '#e74c3c',
                        '#9b59b6',
                      ],
                      borderRadius: 4,
                    },
                  ],
                }}
                options={{
                  indexAxis: 'y',
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

          {/* Chart 3: Sales Contribution Donut */}
          <div className="bg-[#fafbfc] border border-gray-200 p-3.5 rounded-lg min-h-[300px]">
            <h4 className="text-xs font-semibold text-center text-gray-700 mb-2">
              📊 Sales Contribution by Channel
            </h4>
            <div className="h-[240px]">
              <Doughnut
                data={{
                  labels: channelContribution.labels,
                  datasets: [
                    {
                      data: channelContribution.values,
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
                    datalabels: {
                      color: '#fff',
                      font: { weight: 'bold', size: 10 },
                      formatter: (value) => {
                        const pct =
                          channelContribution.total > 0
                            ? (value / channelContribution.total) * 100
                            : 0;
                        return pct > 5 ? `${pct.toFixed(0)}%` : '';
                      },
                    },
                  },
                }}
              />
            </div>
          </div>

          {/* Chart 4: Outstanding Sales */}
          <div className="bg-[#fafbfc] border border-gray-200 p-3.5 rounded-lg min-h-[300px]">
            <h4 className="text-xs font-semibold text-center text-gray-700">
              💰 Outstanding Sales Status
            </h4>
            <div className="text-[10px] text-center text-gray-500 mb-2">
              📊 Month-wise Paid vs Open Amount
            </div>
            <div className="h-[240px]">
              <Bar
                data={{
                  labels: outstandingData.labels,
                  datasets: [
                    {
                      label: 'Paid',
                      data: outstandingData.paid,
                      backgroundColor: '#27ae60',
                    },
                    {
                      label: 'Open',
                      data: outstandingData.open,
                      backgroundColor: '#f39c12',
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 10 } } },
                    datalabels: { display: false },
                  },
                  scales: {
                    x: { stacked: true },
                    y: { stacked: true, beginAtZero: true },
                  },
                }}
              />
            </div>
          </div>
        </div>
      )}

      {activeView === 'summary' && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <div className="relative w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transaction details..."
                className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-1 focus:ring-[#2d5a5a] focus:outline-none"
              />
              <Search size={14} className="absolute left-2.5 top-2 text-gray-400" />
            </div>
            <span className="text-xs text-gray-500">
              Showing {filteredSummaryTable.length} of {summaryTable.length} items
            </span>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs text-center border-collapse min-w-[600px]">
              <thead className="bg-[#1a3a3a] text-white">
                <tr>
                  <th className="py-2.5 px-3 text-left">Transaction Details</th>
                  <th className="py-2.5 px-3">Sales (₹)</th>
                  <th className="py-2.5 px-3">Return (₹)</th>
                  <th className="py-2.5 px-3">Net Sales (₹)</th>
                  <th className="py-2.5 px-3">Return %</th>
                </tr>
              </thead>
              <tbody>
                {filteredSummaryTable.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-gray-400">
                      No matching sales records
                    </td>
                  </tr>
                ) : (
                  filteredSummaryTable.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-left font-medium text-gray-800">{row.detail}</td>
                      <td className="py-2 px-3 text-[#3498db] font-semibold">
                        {formatRupee(row.sales)}
                      </td>
                      <td className="py-2 px-3 text-[#e74c3c] font-semibold">
                        {formatRupee(row.returns)}
                      </td>
                      <td className="py-2 px-3 text-[#27ae60] font-bold">
                        {formatRupee(row.net)}
                      </td>
                      <td className="py-2 px-3 font-bold text-gray-800">
                        {row.returnPct.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === 'raw' && (
        <div>
          <div className="flex flex-wrap justify-between items-center gap-3 mb-3 bg-gray-50 p-2.5 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  type="text"
                  value={rawSearchQuery}
                  onChange={(e) => {
                    setRawSearchQuery(e.target.value);
                    setRawCurrentPage(1);
                  }}
                  placeholder="Search raw transactions by account, invoice #, type, channel..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:ring-1 focus:ring-[#1a3a3a] focus:outline-none"
                />
              </div>
              {rawSearchQuery && (
                <button
                  onClick={() => {
                    setRawSearchQuery('');
                    setRawCurrentPage(1);
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
                  value={rawPageSize}
                  onChange={(e) => {
                    setRawPageSize(Number(e.target.value));
                    setRawCurrentPage(1);
                  }}
                  className="border border-gray-300 rounded-md px-2 py-1 bg-white font-semibold text-gray-700 focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={0}>All ({rawTotalRecords})</option>
                </select>
              </div>

              <div className="text-gray-600 font-medium">
                Showing{' '}
                <span className="font-bold text-[#1a3a3a]">
                  {rawTotalRecords === 0
                    ? 0
                    : rawPageSize === 0
                    ? 1
                    : (validRawPage - 1) * rawPageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-bold text-[#1a3a3a]">
                  {rawPageSize === 0
                    ? rawTotalRecords
                    : Math.min(validRawPage * rawPageSize, rawTotalRecords)}
                </span>{' '}
                of <span className="font-bold text-[#1a3a3a]">{rawTotalRecords}</span> records
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[550px]">
            <table className="w-full text-[11px] text-center border-collapse min-w-[900px]">
              <thead className="bg-[#1a3a3a] text-white sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-2 text-left">#</th>
                  <th className="py-2 px-2 text-left">Month</th>
                  <th className="py-2 px-2 text-left">Channel</th>
                  <th className="py-2 px-2 text-left">Type (Col F)</th>
                  <th className="py-2 px-2 text-left">Account Name</th>
                  <th className="py-2 px-2 text-left">Ref Number</th>
                  <th className="py-2 px-2">Debit (Col I)</th>
                  <th className="py-2 px-2">Credit (Col J)</th>
                  <th className="py-2 px-2">Net Amount</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRawSales.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-gray-400 text-center">
                      No matching raw records found
                    </td>
                  </tr>
                ) : (
                  paginatedRawSales.map((item, idx) => {
                    const rowNum = rawPageSize === 0 ? idx + 1 : (validRawPage - 1) * rawPageSize + idx + 1;
                    return (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-1.5 px-2 text-left text-gray-400 font-mono">{rowNum}</td>
                        <td className="py-1.5 px-2 text-left font-medium">{item.Month}</td>
                        <td className="py-1.5 px-2 text-left">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-800 border border-teal-100">
                            {item.Channel || 'Direct'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-left font-semibold text-teal-900">{item.Transaction_Type}</td>
                        <td className="py-1.5 px-2 text-left truncate max-w-[140px]" title={item.Account_Name}>{item.Account_Name || '-'}</td>
                        <td className="py-1.5 px-2 text-left truncate max-w-[120px]" title={item.Reference_Number}>{item.Reference_Number || '-'}</td>
                        <td className="py-1.5 px-2 text-red-600 font-medium">{formatRupee(parseNum(item.Debit))}</td>
                        <td className="py-1.5 px-2 text-blue-600 font-medium">{formatRupee(parseNum(item.Credit))}</td>
                        <td className="py-1.5 px-2 font-bold">{formatRupee(parseNum(item.Net_Amount))}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {rawPageSize > 0 && rawTotalPages > 1 && (
            <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-200 flex-wrap gap-2 text-xs">
              <span className="text-gray-500">
                Page <span className="font-bold text-gray-800">{validRawPage}</span> of{' '}
                <span className="font-bold text-gray-800">{rawTotalPages}</span>
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setRawCurrentPage(1)}
                  disabled={validRawPage <= 1}
                  className="p-1.5 border border-gray-300 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 bg-white"
                  title="First Page"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  onClick={() => setRawCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={validRawPage <= 1}
                  className="p-1.5 border border-gray-300 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 bg-white"
                  title="Previous Page"
                >
                  <ChevronLeft size={14} />
                </button>

                {generatePageNumbers(validRawPage, rawTotalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`ell-${i}`} className="px-1 text-gray-400">
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${p}`}
                      onClick={() => setRawCurrentPage(Number(p))}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                        validRawPage === p
                          ? 'bg-[#1a3a3a] text-white border-[#1a3a3a] shadow-sm'
                          : 'bg-white text-gray-700 hover:bg-gray-100 border-gray-300'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  onClick={() => setRawCurrentPage((p) => Math.min(rawTotalPages, p + 1))}
                  disabled={validRawPage >= rawTotalPages}
                  className="p-1.5 border border-gray-300 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 bg-white"
                  title="Next Page"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  onClick={() => setRawCurrentPage(rawTotalPages)}
                  disabled={validRawPage >= rawTotalPages}
                  className="p-1.5 border border-gray-300 rounded-md disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 bg-white"
                  title="Last Page"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
