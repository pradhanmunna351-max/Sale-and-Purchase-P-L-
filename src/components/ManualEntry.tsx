import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { Upload, Download, Save, CheckCircle, Trash2, RotateCcw } from 'lucide-react';
import { ExpenseEntry } from '../types';
import { standardizeMonth } from '../utils/monthUtils';

interface ManualEntryProps {
  onAddEntry: (entry: Partial<ExpenseEntry>) => Promise<boolean>;
  onBulkUpload: (rows: any[][]) => Promise<boolean>;
  brandSuggestions: string[];
}

export const ManualEntry: React.FC<ManualEntryProps> = ({
  onAddEntry,
  onBulkUpload,
  brandSuggestions,
}) => {
  // Form State
  const [marketplace, setMarketplace] = useState('');
  const [month, setMonth] = useState(() => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${mm}`;
  });
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [invoiceVal, setInvoiceVal] = useState<string>('');
  const [creditVal, setCreditVal] = useState<string>('');

  // Lock State for batch entries under the same invoice
  const [isLocked, setIsLocked] = useState(false);
  const [batchCount, setBatchCount] = useState(0);

  // File Upload State
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const formatMonth = (monthVal: string) => {
    return standardizeMonth(monthVal);
  };

  const invNum = parseFloat(invoiceVal) || 0;
  const credNum = parseFloat(creditVal) || 0;
  const netPreview = invNum - credNum;

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marketplace.trim()) {
      alert('Marketplace is required');
      return;
    }
    if (!month) {
      alert('Month is required');
      return;
    }
    if (!desc.trim()) {
      alert('Expense Type is required');
      return;
    }

    setIsSaving(true);

    const formattedM = formatMonth(month);

    const success = await onAddEntry({
      marketplace: marketplace.trim(),
      month: formattedM,
      invoiceNumber: invoiceNumber.trim(),
      name: name.trim(),
      desc: desc.trim(),
      invoice: invNum,
      credit: credNum,
      netValue: netPreview,
    });

    setIsSaving(false);

    if (success) {
      setIsLocked(true);
      setBatchCount((prev) => prev + 1);
      // Clear detail fields, keep locked header fields
      setDesc('');
      setInvoiceVal('');
      setCreditVal('');
    }
  };

  const handleNewInvoice = () => {
    setIsLocked(false);
    setBatchCount(0);
    setMarketplace('');
    setInvoiceNumber('');
    setName('');
    setDesc('');
    setInvoiceVal('');
    setCreditVal('');
  };

  const handleCompleteInvoice = () => {
    if (batchCount === 0) {
      alert('No entries created for this invoice yet.');
      return;
    }
    alert(`Invoice ${invoiceNumber || 'Entry'} completed with ${batchCount} item(s)!`);
    handleNewInvoice();
  };

  const handleFileUpload = () => {
    if (!file) {
      alert('Please select a CSV file first');
      return;
    }

    setUploadStatus('Reading file...');

    Papa.parse(file, {
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as string[][];
        if (!rows || rows.length < 2) {
          setUploadStatus('Error: CSV file is empty or has no data rows');
          return;
        }

        const dataRows = rows.slice(1);
        setUploadStatus(`Uploading ${dataRows.length} entries...`);

        const success = await onBulkUpload(dataRows);
        if (success) {
          setUploadStatus(`✅ ${dataRows.length} entries uploaded successfully!`);
          setFile(null);
        } else {
          setUploadStatus('❌ Upload failed. Check file format.');
        }
      },
      error: (err) => {
        setUploadStatus(`Error parsing CSV: ${err.message}`);
      },
    });
  };

  const handleDownloadSample = () => {
    const headers = [
      'Marketplace',
      'Month',
      'Invoice Number',
      'Seller / Brand Name',
      'Expense Type',
      'Invoice Value',
      'Credit Note Value',
      'Net Value',
    ];
    const sampleRows = [
      ['Ajio', 'Jan-2025', 'INV-001', 'Puma', 'Shipping Charges', '1000', '0', '1000'],
      ['Flipkart', 'Feb-2025', 'INV-002', 'Nike', 'Commission', '2500', '500', '2000'],
      ['Myntra', 'Jan-2025', 'INV-003', 'Adidas', 'Fixed Fees', '1500', '0', '1500'],
    ];

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...sampleRows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'ExpenseLedger_Sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-200">
        <h2 className="text-base font-bold text-[#1a3a3a] flex items-center gap-2">
          ✏️ Naya Data Add Karein
        </h2>
        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
          ✅ Ready
        </span>
      </div>

      {/* Expense File Upload Section */}
      <div className="bg-[#f0f7f7] border border-[#dce8e8] p-3.5 rounded-lg mb-5">
        <div className="flex justify-between items-center flex-wrap gap-2 mb-2">
          <span className="font-semibold text-xs text-[#1a3a3a] flex items-center gap-1.5">
            <Upload size={14} /> Upload Expense CSV File
          </span>
          <span className="text-[11px] text-gray-500">
            Header: Marketplace, Month, Invoice Number, Seller / Brand Name, Expense Type, Invoice Value, Credit Note Value, Net Value
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
            <Upload size={13} /> Upload
          </button>

          <button
            onClick={handleDownloadSample}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-md flex items-center gap-1 transition-all"
          >
            <Download size={13} /> Download Sample
          </button>
        </div>

        {uploadStatus && (
          <div className="text-xs font-semibold mt-2 text-[#2d5a5a]">
            {uploadStatus}
          </div>
        )}
      </div>

      {/* Manual Form */}
      <form onSubmit={handleSaveEntry}>
        {/* Invoice Details Block */}
        <div className="bg-[#f8fafc] border border-gray-200 p-3.5 rounded-lg mb-4">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold text-xs text-[#1a3a3a]">📄 Invoice Details</span>
            {isLocked && (
              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                🔒 Locked
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Marketplace <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                list="mktList"
                value={marketplace}
                disabled={isLocked}
                onChange={(e) => setMarketplace(e.target.value)}
                placeholder="e.g. Mysale, Ajio, Flipkart"
                className={`w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-1 focus:ring-[#2d5a5a] focus:outline-none ${
                  isLocked ? 'bg-gray-100 text-gray-700 cursor-not-allowed' : 'bg-white'
                }`}
                required
              />
              <datalist id="mktList">
                <option value="Mysale" />
                <option value="Ajio" />
                <option value="Flipkart" />
                <option value="Amazon" />
                <option value="Myntra" />
                <option value="Nykaa" />
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Month <span className="text-red-500">*</span>
              </label>
              <input
                type="month"
                value={month}
                disabled={isLocked}
                onChange={(e) => setMonth(e.target.value)}
                className={`w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-1 focus:ring-[#2d5a5a] focus:outline-none ${
                  isLocked ? 'bg-gray-100 text-gray-700 cursor-not-allowed' : 'bg-white'
                }`}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Invoice Number
              </label>
              <input
                type="text"
                value={invoiceNumber}
                disabled={isLocked}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. M27KAIN-089114"
                className={`w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-1 focus:ring-[#2d5a5a] focus:outline-none ${
                  isLocked ? 'bg-gray-100 text-gray-700 cursor-not-allowed' : 'bg-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Seller / Brand Name
              </label>
              <input
                type="text"
                list="brandList"
                value={name}
                disabled={isLocked}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bellstone, Puma, Nike"
                className={`w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs focus:ring-1 focus:ring-[#2d5a5a] focus:outline-none ${
                  isLocked ? 'bg-gray-100 text-gray-700 cursor-not-allowed' : 'bg-white'
                }`}
              />
              <datalist id="brandList">
                {brandSuggestions.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
          </div>
        </div>

        {/* Entry Details Block */}
        <div className="bg-[#f0f7f7] border border-[#dce8e8] p-3.5 rounded-lg mb-4">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold text-xs text-[#1a3a3a]">📝 Entry Details</span>
            <span className="bg-[#3498db] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
              Entry #{batchCount + 1}
            </span>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Expense Type <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              list="descList"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="e.g. Shipping Charges"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-xs bg-white focus:ring-1 focus:ring-[#2d5a5a] focus:outline-none"
              required
            />
            <datalist id="descList">
              <option value="VFH Charges" />
              <option value="Shipping Charges" />
              <option value="Fixed Fees" />
              <option value="Collection Cost" />
              <option value="Commission" />
              <option value="Seller Incentive (Credit Note)" />
              <option value="Marketing Claim" />
              <option value="Catalogue Penalty Charges" />
              <option value="Order Cancellation Charges" />
              <option value="Referral Fees" />
              <option value="Closing Fees" />
              <option value="Storage Fees" />
            </datalist>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Invoice Value (₹) <span className="text-red-500">(-)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={invoiceVal}
                onChange={(e) => setInvoiceVal(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-1.5 border border-red-300 bg-red-50/50 rounded-md text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
              />
              <div className="text-[10px] text-red-500 mt-0.5">
                ⚠️ Invoice Value Negative (-) mein calculate hogi
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Credit Note Value (₹) <span className="text-emerald-600">(+)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={creditVal}
                onChange={(e) => setCreditVal(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-1.5 border border-emerald-300 bg-emerald-50/50 rounded-md text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
              <div className="text-[10px] text-emerald-600 mt-0.5">
                ✅ Credit Note Positive (+) mein calculate hogi
              </div>
            </div>
          </div>

          <div className="bg-white p-2.5 rounded-md border border-gray-200 text-xs flex justify-between items-center">
            <span className="font-bold text-gray-700">Net Value:</span>
            <div className="font-extrabold text-sm">
              <span className="text-red-500 font-semibold mr-1">
                {invNum > 0 ? `- ₹ ${invNum.toLocaleString('en-IN')}` : '₹ 0.00'}
              </span>
              -
              <span className="text-emerald-600 font-semibold mx-1">
                {credNum > 0 ? `+ ₹ ${credNum.toLocaleString('en-IN')}` : '₹ 0.00'}
              </span>
              =
              <span
                className={`ml-1 ${
                  netPreview < 0 ? 'text-red-600' : 'text-emerald-600'
                }`}
              >
                ₹ {netPreview.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Form Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 bg-[#2d5a5a] hover:bg-[#1a3a3a] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Save size={14} /> {isSaving ? 'Saving...' : '💾 Save Expense Entry'}
          </button>

          {isLocked && (
            <button
              type="button"
              onClick={handleCompleteInvoice}
              className="px-4 py-2 bg-[#27ae60] hover:bg-[#1e8449] text-white text-xs font-semibold rounded-md flex items-center gap-1.5 shadow-sm transition-all"
            >
              <CheckCircle size={14} /> ✅ Complete Invoice ({batchCount})
            </button>
          )}

          <button
            type="button"
            onClick={handleNewInvoice}
            className="px-3.5 py-2 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all shadow-sm"
          >
            <RotateCcw size={14} /> 🔄 New Invoice
          </button>

          <button
            type="button"
            onClick={handleNewInvoice}
            className="px-3.5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors"
          >
            <Trash2 size={14} /> Clear Form
          </button>
        </div>

        <div className="text-[11px] text-gray-500 mt-3">
          💡 <strong>Tip:</strong> Ek invoice ke multiple entries ke liye, pehli entry save karne ke baad header details locked ho jaate hain taaki batch entry fast ho sake!
        </div>
      </form>
    </div>
  );
};
