import React, { useState, useMemo } from 'react';
import { X, Settings, ShoppingCart, CreditCard, RotateCcw, Link, FileSpreadsheet, Loader2, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PanelDataDashboardProps {
  onClose: () => void;
}

export function PanelDataDashboard({ onClose }: PanelDataDashboardProps) {
  const [activeChannel, setActiveChannel] = useState<'flipkart' | 'jio' | 'myntra'>('flipkart');
  const [activeSubTab, setActiveSubTab] = useState<'sales' | 'payments' | 'returns' | 'settings'>('sales');

  const [sheetLinks, setSheetLinks] = useState<Record<string, string>>({});
  const [panelData, setPanelData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Pagination & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const currentKey = `${activeChannel}-${activeSubTab}`;
  const currentData = panelData[currentKey];

  const channels = [
    { id: 'flipkart', name: 'Flipkart' },
    { id: 'jio', name: 'Ajio' },
    { id: 'myntra', name: 'Myntra' },
  ] as const;

  const handleFetchData = async () => {
    const url = sheetLinks[currentKey];
    if (!url) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/inspect-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPanelData(prev => ({ ...prev, [currentKey]: data }));
        setCurrentPage(1);
        setSearchQuery('');
      } else {
        setErrorMsg(data.message || 'Failed to fetch data');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Error fetching data');
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered rows for current sheet
  const filteredRows = useMemo(() => {
    if (!currentData || !currentData.rawRows) return [];
    if (!searchQuery.trim()) return currentData.rawRows;
    const q = searchQuery.toLowerCase().trim();
    return currentData.rawRows.filter((row: any[]) =>
      row.some((cell: any) => String(cell || '').toLowerCase().includes(q))
    );
  }, [currentData, searchQuery]);

  const totalRecords = filteredRows.length;
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalRecords / pageSize)) : 1;
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedRows = useMemo(() => {
    if (pageSize <= 0) return filteredRows;
    const start = (validPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, validPage, pageSize]);

  const generatePageNumbers = (current: number, total: number) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | string)[] = [1];
    if (current > 3) pages.push('...');
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f0f2f5] flex flex-col h-screen w-screen overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            🖥️ Panel Data
          </h1>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  setActiveChannel(ch.id);
                  setActiveSubTab('sales');
                }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  activeChannel === ch.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {ch.name}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
          title="Close full screen"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar for Sub-tabs */}
        <div className="w-64 bg-white border-r flex flex-col shrink-0">
          <div className="p-4 border-b">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
              {channels.find((c) => c.id === activeChannel)?.name} Data
            </h2>
          </div>
          <nav className="flex-1 p-2 space-y-1">
            <SubTabButton
              active={activeSubTab === 'sales'}
              onClick={() => setActiveSubTab('sales')}
              icon={<ShoppingCart className="w-4 h-4" />}
              label="Sales"
            />
            <SubTabButton
              active={activeSubTab === 'payments'}
              onClick={() => setActiveSubTab('payments')}
              icon={<CreditCard className="w-4 h-4" />}
              label="Payments"
            />
            <SubTabButton
              active={activeSubTab === 'returns'}
              onClick={() => setActiveSubTab('returns')}
              icon={<RotateCcw className="w-4 h-4" />}
              label="Returns"
            />
          </nav>
          <div className="p-2 border-t">
            <SubTabButton
              active={activeSubTab === 'settings'}
              onClick={() => setActiveSubTab('settings')}
              icon={<Settings className="w-4 h-4" />}
              label="Settings"
            />
          </div>
        </div>

        {/* Content Panel */}
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-white rounded-xl shadow-sm border p-6 min-h-full">
            <h2 className="text-2xl font-bold text-gray-800 capitalize mb-6 border-b pb-4">
              {activeChannel} - {activeSubTab}
            </h2>

            {activeSubTab === 'settings' ? (
              <div className="space-y-4 max-w-2xl">
                <p className="text-gray-600">Configure settings specific to {activeChannel}.</p>
                <div className="grid grid-cols-1 gap-4 mt-4">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">API Key</span>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#2d5a5a] focus:ring-[#2d5a5a] sm:text-sm p-2.5 border outline-none"
                      placeholder={`Enter ${activeChannel} API Key`}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Sync Frequency</span>
                    <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#2d5a5a] focus:ring-[#2d5a5a] sm:text-sm p-2.5 border outline-none bg-white">
                      <option>Hourly</option>
                      <option>Daily</option>
                      <option>Weekly</option>
                    </select>
                  </label>
                  <label className="block flex items-center gap-2 mt-2">
                    <input type="checkbox" className="rounded border-gray-300 text-[#2d5a5a] focus:ring-[#2d5a5a]" />
                    <span className="text-sm font-medium text-gray-700">Enable Auto-Sync for {activeChannel}</span>
                  </label>
                  <div className="mt-6 pt-4 border-t">
                    <button className="bg-[#2d5a5a] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#204040] transition-colors">
                      Save Settings
                    </button>
                  </div>
                </div>
              </div>
            ) : currentData ? (
              <div className="flex flex-col h-full overflow-hidden pb-4">
                <div className="flex items-center justify-between mb-4 shrink-0 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold border border-green-200">
                      {currentData.rawRows.length} Rows Imported
                    </div>
                    <span className="text-sm text-gray-500">From connected Google Sheet</span>
                  </div>
                  <button 
                    onClick={() => setPanelData(prev => ({...prev, [currentKey]: null}))}
                    className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-1 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Disconnect Sheet
                  </button>
                </div>

                {/* Toolbar with Search and Page Size Selector */}
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-3 bg-gray-50 p-2.5 rounded-lg border border-gray-200 text-xs">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-2.5 top-2.5 text-gray-400" size={14} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Search across columns..."
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#2d5a5a]"
                    />
                  </div>

                  <div className="flex items-center gap-3 justify-between sm:justify-end">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-600 font-medium">Rows per page:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPageSize(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="border border-gray-300 rounded px-2 py-1 bg-white font-semibold text-gray-700 focus:outline-none"
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
                      <span className="font-bold text-gray-800">
                        {totalRecords === 0
                          ? 0
                          : pageSize === 0
                          ? 1
                          : (validPage - 1) * pageSize + 1}
                      </span>{' '}
                      to{' '}
                      <span className="font-bold text-gray-800">
                        {pageSize === 0
                          ? totalRecords
                          : Math.min(validPage * pageSize, totalRecords)}
                      </span>{' '}
                      of <span className="font-bold text-gray-800">{totalRecords}</span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-auto rounded-xl border shadow-sm bg-white">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead className="sticky top-0 z-10 bg-white shadow-sm ring-1 ring-black ring-opacity-5">
                      <tr className="bg-gradient-to-r from-[#f8f9fa] to-[#f1f3f5] border-b text-gray-700">
                        <th className="py-3 px-3 font-bold text-xs border-r border-gray-200 w-12 text-center bg-gray-100">#</th>
                        {currentData.headers.map((h: string, i: number) => (
                          <th key={i} className="py-3.5 px-4 font-bold text-sm truncate max-w-[200px] border-r last:border-r-0 border-gray-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginatedRows.length === 0 ? (
                        <tr>
                          <td colSpan={(currentData.headers?.length || 1) + 1} className="py-8 text-center text-gray-400">
                            No matching records found
                          </td>
                        </tr>
                      ) : (
                        paginatedRows.map((row: any[], rIdx: number) => {
                          const rowNum = pageSize === 0 ? rIdx + 1 : (validPage - 1) * pageSize + rIdx + 1;
                          return (
                            <tr key={rIdx} className="hover:bg-blue-50/30 transition-colors">
                              <td className="py-2.5 px-3 text-xs text-gray-400 font-mono text-center border-r border-gray-100 bg-gray-50/50">
                                {rowNum}
                              </td>
                              {currentData.headers.map((_: any, cIdx: number) => {
                                const val = row[cIdx] !== undefined && row[cIdx] !== null ? String(row[cIdx]) : '-';
                                const isNumeric = /^-?\d+(\.\d+)?$/.test(val.replace(/,/g, ''));
                                return (
                                  <td 
                                    key={cIdx} 
                                    className={`py-3 px-4 text-sm text-gray-700 truncate max-w-[200px] border-r last:border-r-0 border-gray-100 ${isNumeric ? 'font-medium text-blue-900' : ''}`}
                                  >
                                    {val}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Bottom Pagination Bar */}
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
                            key={p}
                            onClick={() => setCurrentPage(Number(p))}
                            className={`px-2.5 py-1 border rounded-md font-medium ${
                              validPage === p
                                ? 'bg-[#2d5a5a] text-white border-[#2d5a5a]'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
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
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[60vh] bg-gradient-to-br from-[#f8fafc] to-[#f1f5f9] rounded-2xl border border-gray-200 p-8 text-center shadow-inner">
                <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6 border border-gray-100 text-[#2d5a5a] shadow-blue-500/10">
                  {activeSubTab === 'sales' && <ShoppingCart className="w-10 h-10" />}
                  {activeSubTab === 'payments' && <CreditCard className="w-10 h-10" />}
                  {activeSubTab === 'returns' && <RotateCcw className="w-10 h-10" />}
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Connect {activeChannel} {activeSubTab} Data</h3>
                <p className="text-gray-500 text-sm max-w-md mb-8">
                  Paste your Google Sheet link to automatically load, parse, and visualize the {activeSubTab} records directly from the cloud.
                </p>
                
                <div className="w-full max-w-lg flex flex-col gap-3">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Link className="h-5 w-5 text-gray-400" />
                    </div>
                    <input 
                      type="text" 
                      placeholder="https://docs.google.com/spreadsheets/d/..." 
                      className="block w-full pl-11 pr-4 py-3.5 border-gray-300 rounded-xl focus:ring-[#2d5a5a] focus:border-[#2d5a5a] shadow-sm transition-all text-sm outline-none border"
                      value={sheetLinks[currentKey] || ''}
                      onChange={(e) => setSheetLinks(prev => ({...prev, [currentKey]: e.target.value}))}
                    />
                  </div>
                  <button
                    onClick={handleFetchData}
                    disabled={isLoading || !sheetLinks[currentKey]}
                    className="w-full bg-[#2d5a5a] text-white font-bold py-3.5 rounded-xl hover:bg-[#204040] focus:ring-4 focus:ring-[#2d5a5a]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-md"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileSpreadsheet className="w-5 h-5" />}
                    {isLoading ? 'Importing Data...' : 'Import & Visualize Data'}
                  </button>
                  {errorMsg && (
                    <div className="mt-2 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100 text-left font-medium">
                      {errorMsg}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubTabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-[#2d5a5a]/10 text-[#2d5a5a]'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
