import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { Upload, Download, RotateCcw, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { PurchaseRecord, FilterState } from '../types';
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

interface PurchaseDashboardProps {
  purchaseData: PurchaseRecord[];
  onBulkUpload?: (rows: any[][]) => Promise<boolean>;
  onResetPurchase?: () => void;
}

export const PurchaseDashboard: React.FC<PurchaseDashboardProps> = ({
  purchaseData,
  onBulkUpload,
  onResetPurchase,
}) => {
  const [activeView, setActiveView] = useState<'dashboard' | 'summary' | 'raw'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [showUploader, setShowUploader] = useState(false);

  // Pagination states for Raw Purchase Records
  const [rawSearchQuery, setRawSearchQuery] = useState('');
  const [rawCurrentPage, setRawCurrentPage] = useState(1);
  const [rawPageSize, setRawPageSize] = useState<number>(25);

  const [filters, setFilters] = useState<FilterState>({
    channel: 'all',
    month: 'all',
    year: 'all',
  });

  const channelsList = useMemo(() => {
    const set = new Set<string>();
    purchaseData.forEach((p) => p.Channel && set.add(p.Channel));
    return Array.from(set).sort();
  }, [purchaseData]);

  const monthsList = useMemo(() => {
    const set = new Set<string>();
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
  }, [purchaseData]);

  const yearsList = useMemo(() => {
    const set = new Set<string>();
    monthsList.forEach((m) => {
      const match = m.match(/\d{4}/);
      if (match) set.add(match[0]);
    });
    return Array.from(set).sort();
  }, [monthsList]);

  // Filtered Purchase
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

  // Calculations
  const totals = useMemo(() => {
    let purchase = 0;
    let returns = 0;

    filteredPurchase.forEach((item) => {
      const transType = String(item.Transaction_Type || '').toLowerCase().trim();
      if (transType === 'bill') {
        let debitVal = parseFloat(String(item.Debit)) || 0;
        if (debitVal < 0) debitVal = Math.abs(debitVal);
        if (debitVal === 0) {
          debitVal = parseFloat(String(item.Net_Amount)) || 0;
          if (debitVal < 0) debitVal = Math.abs(debitVal);
        }
        purchase += debitVal;
      }
      if (transType === 'vendor_credit') {
        let creditVal = parseFloat(String(item.Credit)) || 0;
        if (creditVal < 0) creditVal = Math.abs(creditVal);
        if (creditVal === 0) {
          creditVal = parseFloat(String(item.Net_Amount)) || 0;
          if (creditVal < 0) creditVal = Math.abs(creditVal);
        }
        returns += creditVal;
      }
    });

    const netPurchase = purchase - returns;
    const returnPercent = purchase > 0 ? (returns / purchase) * 100 : 0;

    return { purchase, returns, netPurchase, returnPercent };
  }, [filteredPurchase]);

  // MoM Data
  const momData = useMemo(() => {
    const map: Record<string, { purchase: number; returns: number }> = {};
    filteredPurchase.forEach((item) => {
      const m = standardizeMonth(item.Month) || 'Unknown';
      if (!map[m]) map[m] = { purchase: 0, returns: 0 };
      const transType = String(item.Transaction_Type || '').toLowerCase().trim();
      if (transType === 'bill') {
        let val = parseFloat(String(item.Debit)) || parseFloat(String(item.Net_Amount)) || 0;
        map[m].purchase += Math.abs(val);
      }
      if (transType === 'vendor_credit') {
        let val = parseFloat(String(item.Credit)) || parseFloat(String(item.Net_Amount)) || 0;
        map[m].returns += Math.abs(val);
      }
    });

    const labels = Object.keys(map).sort((a, b) => {
      const tA = parseMonthTimestamp(a);
      const tB = parseMonthTimestamp(b);
      if (tA && tB) return tA - tB;
      return a.localeCompare(b);
    });
    const purchaseArr = labels.map((l) => map[l].purchase);
    const returnArr = labels.map((l) => map[l].returns);
    const returnPctArr = labels.map((l) =>
      map[l].purchase > 0 ? (map[l].returns / map[l].purchase) * 100 : 0
    );

    return { labels, purchaseArr, returnArr, returnPctArr };
  }, [filteredPurchase]);

  // Top 5 Transaction Details
  const top5Data = useMemo(() => {
    const map: Record<string, number> = {};
    filteredPurchase.forEach((item) => {
      const detail = item.Transaction_Details || 'N/A';
      const transType = String(item.Transaction_Type || '').toLowerCase().trim();
      if (transType === 'bill') {
        let val = parseFloat(String(item.Debit)) || parseFloat(String(item.Net_Amount)) || 0;
        map[detail] = (map[detail] || 0) + Math.abs(val);
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
  }, [filteredPurchase]);

  // Channel Contribution Donut
  const channelContribution = useMemo(() => {
    const map: Record<string, number> = {};
    filteredPurchase.forEach((item) => {
      const channel = item.Channel || 'Unknown';
      const transType = String(item.Transaction_Type || '').toLowerCase().trim();
      if (transType === 'bill') {
        let val = parseFloat(String(item.Debit)) || parseFloat(String(item.Net_Amount)) || 0;
        map[channel] = (map[channel] || 0) + Math.abs(val);
      }
    });

    const labels = Object.keys(map);
    const values = labels.map((l) => map[l]);
    const total = values.reduce((a, b) => a + b, 0);

    return { labels, values, total };
  }, [filteredPurchase]);

  // Outstanding Data (Month-wise & Status-wise)
  const outstandingData = useMemo(() => {
    const map: Record<string, { paid: number; open: number }> = {};
    filteredPurchase.forEach((item) => {
      const m = standardizeMonth(item.Month) || 'Unknown';
      const status = String(item['Final Status'] || '').toLowerCase().trim();
      if (!map[m]) map[m] = { paid: 0, open: 0 };

      let val = parseFloat(String(item.Debit)) || parseFloat(String(item.Net_Amount)) || 0;
      val = Math.abs(val);

      if (status === 'paid') map[m].paid += val;
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
  }, [filteredPurchase]);

  // Summary Table Data
  const summaryTable = useMemo(() => {
    const map: Record<string, { purchase: number; returns: number }> = {};
    filteredPurchase.forEach((item) => {
      const detail = item.Transaction_Details || 'N/A';
      if (!map[detail]) map[detail] = { purchase: 0, returns: 0 };
      const transType = String(item.Transaction_Type || '').toLowerCase().trim();
      if (transType === 'bill') {
        let val = parseFloat(String(item.Debit)) || parseFloat(String(item.Net_Amount)) || 0;
        map[detail].purchase += Math.abs(val);
      }
      if (transType === 'vendor_credit') {
        let val = parseFloat(String(item.Credit)) || parseFloat(String(item.Net_Amount)) || 0;
        map[detail].returns += Math.abs(val);
      }
    });

    return Object.keys(map).map((k) => {
      const purchase = map[k].purchase;
      const returns = map[k].returns;
      const net = purchase - returns;
      const returnPct = purchase > 0 ? (returns / purchase) * 100 : 0;
      return { detail: k, purchase, returns, net, returnPct };
    });
  }, [filteredPurchase]);

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
        setUploadStatus(`Uploading ${dataRows.length} purchase records...`);
        const success = await onBulkUpload(dataRows);
        if (success) {
          setUploadStatus(`✅ ${dataRows.length} purchase records added successfully!`);
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
      ['Jan-2025', 'Ajio', '2025-01-02', 'Supplier Puma Global', 'Puma Activewear', 'Bill', 'BILL-PUM-01', 'SUP-01', '110000', '0', '110000', 'Completed', 'Paid', ''],
      ['Jan-2025', 'Ajio', '2025-01-15', 'Supplier Puma Global', 'Puma Activewear', 'Vendor_Credit', 'VC-PUM-01', 'SUP-01', '0', '12000', '12000', 'Processed', 'Paid', 'Defective Supply'],
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...sampleRows.map(e => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = 'Purchase_Sample.csv';
    link.click();
  };

  const handleExportCSV = () => {
    if (!filteredPurchase.length) return;
    const headers = [
      'Month', 'Channel', 'Date', 'Account_Name', 'Transaction_Details',
      'Transaction_Type', 'Reference_Number', 'Entity_Number', 'Debit', 'Credit',
      'Net_Amount', 'Status', 'Final Status', 'Return Type'
    ];
    const rows = filteredPurchase.map(p => [
      p.Month, p.Channel, p.Date, p.Account_Name, p.Transaction_Details,
      p.Transaction_Type, p.Reference_Number, p.Entity_Number, p.Debit, p.Credit,
      p.Net_Amount, p.Status, p['Final Status'], p['Return Type']
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.map(x => `"${x || ''}"`).join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `Purchase_Data_${filters.channel}_${filters.month}.csv`;
    link.click();
  };

  const filteredSummaryTable = useMemo(() => {
    if (!searchQuery.trim()) return summaryTable;
    const q = searchQuery.toLowerCase();
    return summaryTable.filter(r => r.detail.toLowerCase().includes(q));
  }, [summaryTable, searchQuery]);

  // Raw Purchase Search & Pagination
  const searchedRawPurchase = useMemo(() => {
    if (!rawSearchQuery.trim()) return filteredPurchase;
    const q = rawSearchQuery.toLowerCase().trim();
    return filteredPurchase.filter((item) => {
      return (
        String(item.Month || '').toLowerCase().includes(q) ||
        String(item.Channel || '').toLowerCase().includes(q) ||
        String(item.Transaction_Type || '').toLowerCase().includes(q) ||
        String(item.Account_Name || '').toLowerCase().includes(q) ||
        String(item.Reference_Number || '').toLowerCase().includes(q) ||
        String(item.Transaction_Details || '').toLowerCase().includes(q)
      );
    });
  }, [filteredPurchase, rawSearchQuery]);

  const rawTotalRecords = searchedRawPurchase.length;
  const rawTotalPages = rawPageSize > 0 ? Math.max(1, Math.ceil(rawTotalRecords / rawPageSize)) : 1;
  const validRawPage = Math.min(Math.max(1, rawCurrentPage), rawTotalPages);

  const paginatedRawPurchase = useMemo(() => {
    if (rawPageSize <= 0) return searchedRawPurchase;
    const start = (validRawPage - 1) * rawPageSize;
    return searchedRawPurchase.slice(start, start + rawPageSize);
  }, [searchedRawPurchase, validRawPage, rawPageSize]);

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

  const parseNum = (val: any) => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const str = String(val || '').replace(/[^0-9.-]/g, '').trim();
    const n = parseFloat(str);
    return isNaN(n) ? 0 : n;
  };

  const formatRupee = (val: number) =>
    '₹ ' + Math.round(val).toLocaleString('en-IN');

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-200 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-[#1a3a3a] flex items-center gap-2">
            🛒 Purchase Dashboard
          </h2>
          <span className="text-[11px] text-gray-500">
            Purchase Analysis with Outstanding
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowUploader(!showUploader)}
            className="px-2.5 py-1.5 bg-[#f0f7f7] hover:bg-[#e2f0f0] text-[#2d5a5a] text-xs font-semibold rounded-md flex items-center gap-1 border border-[#dce8e8] transition-all"
          >
            <Upload size={13} /> {showUploader ? 'Hide Uploader' : 'Upload Purchase CSV'}
          </button>

          <button
            onClick={handleExportCSV}
            className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-md flex items-center gap-1 transition-all"
          >
            <Download size={13} /> Export CSV
          </button>

          <div className="flex bg-gray-100 p-0.5 rounded-lg">
            <button
              onClick={() => setActiveView('dashboard')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeView === 'dashboard'
                  ? 'bg-white text-[#1a3a3a] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📊 Dashboard
            </button>
            <button
              onClick={() => setActiveView('summary')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeView === 'summary'
                  ? 'bg-white text-[#1a3a3a] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📋 Summary
            </button>
            <button
              onClick={() => setActiveView('raw')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeView === 'raw'
                  ? 'bg-white text-[#1a3a3a] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📑 Raw Records
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
              <Upload size={14} /> Upload Purchase CSV
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
              <Upload size={13} /> Upload Purchase
            </button>

            <button
              onClick={handleDownloadSample}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-md flex items-center gap-1 transition-all"
            >
              <Download size={13} /> Download Sample CSV
            </button>

            {onResetPurchase && (
              <button
                onClick={onResetPurchase}
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
            Total Purchase
          </div>
          <div className="text-xl font-extrabold text-[#1a3a3a] mt-1">
            {formatRupee(totals.purchase)}
          </div>
        </div>

        <div className="bg-[#f8fafc] p-3.5 rounded-lg border border-gray-200 border-l-4 border-l-[#e74c3c]">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Purchase Return
          </div>
          <div className="text-xl font-extrabold text-[#e74c3c] mt-1">
            {formatRupee(totals.returns)}
          </div>
        </div>

        <div className="bg-[#f8fafc] p-3.5 rounded-lg border border-gray-200 border-l-4 border-l-[#2d5a5a]">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Net Purchase
          </div>
          <div className="text-xl font-extrabold text-[#27ae60] mt-1">
            {formatRupee(totals.netPurchase)}
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

      {activeView === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Chart 1: Purchase vs Return (MoM) */}
          <div className="bg-[#fafbfc] border border-gray-200 p-3.5 rounded-lg min-h-[300px]">
            <h4 className="text-xs font-semibold text-center text-gray-700">
              📊 Purchase vs Return (Month on Month)
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
                      label: 'Purchase',
                      data: momData.purchaseArr,
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
              🏆 Top 5 Transaction Details by Purchase
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
                      label: 'Purchase',
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

          {/* Chart 3: Purchase Contribution Donut */}
          <div className="bg-[#fafbfc] border border-gray-200 p-3.5 rounded-lg min-h-[300px]">
            <h4 className="text-xs font-semibold text-center text-gray-700 mb-2">
              📊 Purchase Contribution by Channel
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

          {/* Chart 4: Outstanding Purchase */}
          <div className="bg-[#fafbfc] border border-gray-200 p-3.5 rounded-lg min-h-[300px]">
            <h4 className="text-xs font-semibold text-center text-gray-700">
              💰 Outstanding Purchase Status
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
                  <th className="py-2.5 px-3">Purchase (₹)</th>
                  <th className="py-2.5 px-3">Return (₹)</th>
                  <th className="py-2.5 px-3">Net Purchase (₹)</th>
                  <th className="py-2.5 px-3">Return %</th>
                </tr>
              </thead>
              <tbody>
                {filteredSummaryTable.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-gray-400">
                      No matching purchase records
                    </td>
                  </tr>
                ) : (
                  filteredSummaryTable.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-left font-medium text-gray-800">{row.detail}</td>
                      <td className="py-2 px-3 text-[#3498db] font-semibold">
                        {formatRupee(row.purchase)}
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
                  placeholder="Search raw purchase transactions by account, invoice #, type, channel..."
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
                  <th className="py-2 px-2 text-left">Type</th>
                  <th className="py-2 px-2 text-left">Account Name</th>
                  <th className="py-2 px-2 text-left">Ref Number</th>
                  <th className="py-2 px-2">Debit</th>
                  <th className="py-2 px-2">Credit</th>
                  <th className="py-2 px-2">Net Amount</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRawPurchase.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-gray-400 text-center">
                      No matching raw purchase records found
                    </td>
                  </tr>
                ) : (
                  paginatedRawPurchase.map((item, idx) => {
                    const rowNum = rawPageSize === 0 ? idx + 1 : (validRawPage - 1) * rawPageSize + idx + 1;
                    return (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-1.5 px-2 text-left text-gray-400 font-mono">{rowNum}</td>
                        <td className="py-1.5 px-2 text-left font-medium">{item.Month}</td>
                        <td className="py-1.5 px-2 text-left">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-800 border border-blue-100">
                            {item.Channel || 'Direct'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-left font-semibold text-blue-900">{item.Transaction_Type}</td>
                        <td className="py-1.5 px-2 text-left truncate max-w-[140px]" title={item.Account_Name}>{item.Account_Name || '-'}</td>
                        <td className="py-1.5 px-2 text-left truncate max-w-[120px]" title={item.Reference_Number}>{item.Reference_Number || '-'}</td>
                        <td className="py-1.5 px-2 text-blue-600 font-medium">{formatRupee(parseNum(item.Debit))}</td>
                        <td className="py-1.5 px-2 text-red-600 font-medium">{formatRupee(parseNum(item.Credit))}</td>
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
