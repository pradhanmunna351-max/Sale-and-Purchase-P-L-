import React, { useState } from 'react';
import { ExternalLink, X, Save, Search, CheckCircle, RefreshCw, Layers, Table } from 'lucide-react';

interface SheetUrls {
  sales: string;
  purchase: string;
  expense: string;
  payment: string;
}

interface SheetUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheetUrls: SheetUrls;
  onSave: (newUrls: SheetUrls) => void;
  onDataImported?: () => void;
}

export const SheetUrlModal: React.FC<SheetUrlModalProps> = ({
  isOpen,
  onClose,
  sheetUrls,
  onSave,
  onDataImported,
}) => {
  const [activeTab, setActiveTab] = useState<'urls' | 'inspector'>('inspector');

  // URL Config State
  const [salesUrl, setSalesUrl] = useState(sheetUrls.sales);
  const [purchaseUrl, setPurchaseUrl] = useState(sheetUrls.purchase);
  const [expenseUrl, setExpenseUrl] = useState(sheetUrls.expense);
  const [paymentUrl, setPaymentUrl] = useState(sheetUrls.payment);

  // Inspector State
  const [inspectUrl, setInspectUrl] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<{
    headers: string[];
    totalRows: number;
    detectedCategory: 'sales' | 'purchase' | 'expense' | 'payment';
    suggestedMapping?: Record<string, string>;
    sampleRows: string[][];
    rawRows: string[][];
  } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'sales' | 'purchase' | 'expense' | 'payment'>('sales');
  const [columnMapping, setColumnMapping] = useState<{
    month: string;
    channel: string;
    debit: string;
    credit: string;
    name: string;
    desc: string;
    referenceNumber: string;
  }>({
    month: '',
    channel: '',
    debit: '',
    credit: '',
    name: '',
    desc: '',
    referenceNumber: '',
  });
  const [inspectError, setInspectError] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  const handleSaveUrls = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      sales: salesUrl.trim(),
      purchase: purchaseUrl.trim(),
      expense: expenseUrl.trim(),
      payment: paymentUrl.trim(),
    });
    onClose();
  };

  const handleInspectLink = async () => {
    if (!inspectUrl.trim()) return;
    setIsInspecting(true);
    setInspectError('');
    setInspectionResult(null);
    setImportStatus('');

    try {
      const res = await fetch('/api/inspect-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inspectUrl.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setInspectionResult({
          headers: data.headers,
          totalRows: data.totalRows,
          detectedCategory: data.detectedCategory,
          suggestedMapping: data.suggestedMapping,
          sampleRows: data.sampleRows,
          rawRows: data.rawRows,
        });
        setSelectedCategory(data.detectedCategory);
        if (data.suggestedMapping) {
          setColumnMapping({
            month: data.suggestedMapping.month || '',
            channel: data.suggestedMapping.channel || '',
            debit: data.suggestedMapping.debit || '',
            credit: data.suggestedMapping.credit || '',
            name: data.suggestedMapping.name || '',
            desc: data.suggestedMapping.desc || '',
            referenceNumber: data.suggestedMapping.referenceNumber || '',
          });
        }
      } else {
        setInspectError(data.message || 'Failed to inspect link.');
      }
    } catch (err: any) {
      setInspectError('Network error while connecting to server.');
    } finally {
      setIsInspecting(false);
    }
  };

  const handleApplyAndSetValues = async () => {
    if (!inspectionResult) return;
    setIsImporting(true);
    setImportStatus('Setting values according to headers and mapped columns...');

    try {
      // Map raw rows into object records using extracted headers
      const records = inspectionResult.rawRows.map((row) => {
        const obj: Record<string, any> = {};
        inspectionResult.headers.forEach((h, index) => {
          obj[h] = row[index] || '';
        });
        return obj;
      });

      const res = await fetch('/api/import-parsed-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: selectedCategory,
          records,
          columnMapping,
          sourceUrl: inspectUrl.trim(),
        }),
      });

      if (!res.ok) {
        setImportStatus(`❌ Server returned error (${res.status}). Data might be processing in the background. Please close and refresh.`);
        setIsImporting(false);
        return;
      }

      const data = await res.json();
      if (res.ok && data.success) {
        setImportStatus(`✅ ${data.message}`);
        // Also update the corresponding sheet URL state
        if (selectedCategory === 'sales') setSalesUrl(inspectUrl.trim());
        if (selectedCategory === 'purchase') setPurchaseUrl(inspectUrl.trim());
        if (selectedCategory === 'expense') setExpenseUrl(inspectUrl.trim());
        if (selectedCategory === 'payment') setPaymentUrl(inspectUrl.trim());

        onSave({
          sales: selectedCategory === 'sales' ? inspectUrl.trim() : salesUrl,
          purchase: selectedCategory === 'purchase' ? inspectUrl.trim() : purchaseUrl,
          expense: selectedCategory === 'expense' ? inspectUrl.trim() : expenseUrl,
          payment: selectedCategory === 'payment' ? inspectUrl.trim() : paymentUrl,
        });

        if (onDataImported) onDataImported();
        
        // Auto-close modal after slight delay so user sees success
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setImportStatus(`❌ ${data.message || 'Import failed'}`);
      }
    } catch (err: any) {
      setImportStatus(`❌ Error processing data import: ${err.message || 'Unknown error'}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6 overflow-hidden">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col animate-fadeIn border border-gray-200 overflow-hidden">
        {/* Fixed Header with Prominent Close Button */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 bg-gray-50/90 shrink-0">
          <h3 className="text-sm sm:text-base font-bold text-[#1a3a3a] flex items-center gap-2">
            ⚙️ Google Sheet & Link Settings
          </h3>
          <button
            onClick={onClose}
            type="button"
            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors flex items-center justify-center border border-gray-200 hover:border-red-200 bg-white shadow-xs"
            title="Close Modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5 text-xs">
          {/* Modal Navigation Tabs */}
          <div className="flex gap-2 border-b border-gray-200 pb-2.5">
            <button
              type="button"
              onClick={() => setActiveTab('inspector')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
                activeTab === 'inspector'
                  ? 'bg-[#1a3a3a] text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Search size={14} /> Link Header Inspector & Auto-Set
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('urls')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
                activeTab === 'urls'
                  ? 'bg-[#1a3a3a] text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Table size={14} /> Registered Sheet URLs
            </button>
          </div>

        {activeTab === 'inspector' ? (
          <div>
            <p className="text-xs text-gray-600 mb-3">
              Yahan Google Sheet link paste karke <strong>"Inspect Sheet Headers"</strong> button dabaayein. Link se saare headers auto-extract ho jayenge aur unke hisaab se values auto-set ho jayengi!
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Paste Google Sheet / CSV Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inspectUrl}
                    onChange={(e) => setInspectUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1kpjCJHzDRLVhvzd09GGTRvwWSlq-j9QHpU9kBoAbrAU/edit?pli=1&gid=439511693#gid=439511693"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-[#2d5a5a] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleInspectLink}
                    disabled={isInspecting || !inspectUrl.trim()}
                    className="px-4 py-2 bg-[#2d5a5a] hover:bg-[#1a3a3a] disabled:bg-gray-300 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 shadow-sm transition-all whitespace-nowrap"
                  >
                    {isInspecting ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" /> Fetching Headers...
                      </>
                    ) : (
                      <>
                        <Search size={14} /> Inspect Headers
                      </>
                    )}
                  </button>
                </div>
              </div>

              {inspectError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-md">
                  ❌ {inspectError}
                </div>
              )}

              {/* Inspection Results Box */}
              {inspectionResult && (
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-lg space-y-3 animate-fadeIn">
                  <div className="flex justify-between items-center flex-wrap gap-2 pb-2 border-b border-slate-200">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle size={15} className="text-emerald-600" />
                      Extracted Headers ({inspectionResult.headers.length} Columns Found)
                    </span>
                    <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      {inspectionResult.totalRows} Data Rows Found
                    </span>
                  </div>

                  {/* Header Badges */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                      Detected Sheet Columns / Headers:
                    </label>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-white border border-slate-200 rounded-md">
                      {inspectionResult.headers.map((h, i) => (
                        <span
                          key={i}
                          className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium px-2 py-0.5 rounded-md"
                        >
                          #{i + 1} {h}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Auto-Detected Column Mapping Configuration */}
                  <div className="bg-white p-3 rounded-md border border-slate-200 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-[#1a3a3a] flex items-center gap-1.5">
                        ⚡ Auto-Detected Column Mappings
                      </span>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-medium">
                        Auto-Matched based on Sheet Headers
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                          📅 Month Column
                        </label>
                        <select
                          value={columnMapping.month}
                          onChange={(e) => setColumnMapping({ ...columnMapping, month: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">-- Select Header --</option>
                          {inspectionResult.headers.map((h, i) => (
                            <option key={i} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                          🏪 Channel / Marketplace
                        </label>
                        <select
                          value={columnMapping.channel}
                          onChange={(e) => setColumnMapping({ ...columnMapping, channel: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">-- Select Header --</option>
                          {inspectionResult.headers.map((h, i) => (
                            <option key={i} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                          💸 Debit / Invoice Value
                        </label>
                        <select
                          value={columnMapping.debit}
                          onChange={(e) => setColumnMapping({ ...columnMapping, debit: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">-- Select Header --</option>
                          {inspectionResult.headers.map((h, i) => (
                            <option key={i} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                          💳 Credit / Credit Note
                        </label>
                        <select
                          value={columnMapping.credit}
                          onChange={(e) => setColumnMapping({ ...columnMapping, credit: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">-- Select Header --</option>
                          {inspectionResult.headers.map((h, i) => (
                            <option key={i} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                          🏷️ Seller / Brand Name
                        </label>
                        <select
                          value={columnMapping.name}
                          onChange={(e) => setColumnMapping({ ...columnMapping, name: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">-- Select Header --</option>
                          {inspectionResult.headers.map((h, i) => (
                            <option key={i} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                          📝 Details / Expense Type
                        </label>
                        <select
                          value={columnMapping.desc}
                          onChange={(e) => setColumnMapping({ ...columnMapping, desc: e.target.value })}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">-- Select Header --</option>
                          {inspectionResult.headers.map((h, i) => (
                            <option key={i} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Target Category Selection */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Map Data To Dashboard Category:
                      </label>
                      <select
                        value={selectedCategory}
                        onChange={(e: any) => setSelectedCategory(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-xs font-medium bg-white focus:ring-2 focus:ring-[#2d5a5a] focus:outline-none"
                      >
                        <option value="sales">💰 Sales Dashboard</option>
                        <option value="purchase">🛒 Purchase Dashboard</option>
                        <option value="expense">📋 Expense Ledger</option>
                        <option value="payment">💸 Payment Received</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleApplyAndSetValues}
                        disabled={isImporting}
                        className="w-full px-4 py-2 bg-[#27ae60] hover:bg-[#1e8449] disabled:bg-gray-300 text-white text-xs font-bold rounded-md flex items-center justify-center gap-1.5 shadow-md transition-all"
                      >
                        {isImporting ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" /> Processing Values...
                          </>
                        ) : (
                          <>
                            <Layers size={14} /> Auto-Set Values & Sync Now
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {importStatus && (
                    <div className="text-xs font-bold text-center p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
                      {importStatus}
                    </div>
                  )}

                  {/* Data Preview Table */}
                  {inspectionResult.sampleRows.length > 0 && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Sample Values Preview (First 3 Rows):
                      </label>
                      <div className="overflow-x-auto border border-slate-200 rounded bg-white">
                        <table className="w-full text-[10px] text-left border-collapse min-w-[500px]">
                          <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                            <tr>
                              {inspectionResult.headers.slice(0, 7).map((h, i) => (
                                <th key={i} className="p-1.5 border-r border-slate-200">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {inspectionResult.sampleRows.map((row, rIdx) => (
                              <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50">
                                {inspectionResult.headers.slice(0, 7).map((_, cIdx) => (
                                  <td key={cIdx} className="p-1.5 border-r border-slate-100 text-slate-600 truncate max-w-[120px]">
                                    {row[cIdx] || '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Registered URLs Tab */
          <form onSubmit={handleSaveUrls} className="space-y-3.5">
            <p className="text-xs text-gray-600 mb-2">
              Aap apne main Google Spreadsheets ke direct URLs update kar sakte hain:
            </p>

            <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 mb-4">
              <label className="block text-xs font-bold text-emerald-800 mb-1">
                🔗 Master Sheet Link (Auto-fill all tabs)
              </label>
              <p className="text-[10px] text-emerald-600 mb-2">
                Paste your main Google Sheet link here to automatically set Sales, Purchase, Expense, and Payment links.
              </p>
              <input
                type="text"
                placeholder="https://docs.google.com/spreadsheets/d/1kpjCJHzDRLVhvzd09GGTRvwWSlq-j9QHpU9kBoAbrAU/edit"
                className="w-full px-3 py-2 border border-emerald-200 rounded-md text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                onChange={(e) => {
                  const val = e.target.value;
                  const match = val.match(/(https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]+)/);
                  if (match) {
                    const baseUrl = match[1];
                    setSalesUrl(`${baseUrl}/edit#gid=439511693`);
                    setPurchaseUrl(`${baseUrl}/edit#gid=703337859`);
                    setExpenseUrl(`${baseUrl}/edit#gid=1491839510`);
                    setPaymentUrl(`${baseUrl}/edit#gid=265200234`);
                  }
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-emerald-700 mb-1">
                💰 Sales Sheet URL
              </label>
              <input
                type="text"
                value={salesUrl}
                onChange={(e) => setSalesUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=439511693"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-sky-700 mb-1">
                🛒 Purchase Sheet URL
              </label>
              <input
                type="text"
                value={purchaseUrl}
                onChange={(e) => setPurchaseUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=703337859"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-700 mb-1">
                📋 Expense Sheet URL
              </label>
              <input
                type="text"
                value={expenseUrl}
                onChange={(e) => setExpenseUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=1491839510"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-purple-700 mb-1">
                💸 Payment Received Sheet URL
              </label>
              <input
                type="text"
                value={paymentUrl}
                onChange={(e) => setPaymentUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=265200234"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#2d5a5a] hover:bg-[#1a3a3a] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Save size={14} /> Save All Sheet URLs
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  );
};

