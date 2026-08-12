import React, { Component, useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { SheetUrlModal } from './components/SheetUrlModal';
import { SalesDashboard } from './components/SalesDashboard';
import { PurchaseDashboard } from './components/PurchaseDashboard';
import { OutstandingDashboard } from './components/OutstandingDashboard';
import { ExpenseData } from './components/ExpenseData';
import { SummaryTab } from './components/SummaryTab';
import { PLAnalysis } from './components/PLAnalysis';
import { ManualEntry } from './components/ManualEntry';
import { ToastContainer } from './components/Toast';
import { PanelDataDashboard } from './components/PanelDataDashboard';
import { ExpenseEntry, SalesRecord, PurchaseRecord, ToastMessage } from './types';
import { INITIAL_EXPENSES, INITIAL_SALES, INITIAL_PURCHASE } from './data/mockData';

interface TabErrorBoundaryProps {
  children: React.ReactNode;
  tabName: string;
  key?: React.Key;
}

interface TabErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  constructor(props: TabErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Error in tab ${this.props.tabName}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-white rounded-xl shadow-md my-4 border border-red-100 max-w-2xl mx-auto">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3 text-xl font-bold">⚠️</div>
          <h2 className="text-lg font-bold text-gray-800 mb-1">Error Loading {this.props.tabName}</h2>
          <p className="text-gray-500 text-sm mb-4">{this.state.error?.message || 'An unexpected error occurred while rendering this tab.'}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-5 py-2.5 bg-[#2d5a5a] text-white rounded-lg text-xs font-bold hover:bg-[#204040] transition-colors"
          >
            Try Reloading Tab
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'sales' | 'purchase' | 'expense' | 'summary' | 'pl' | 'manual' | 'outstanding' | 'panel'>('sales');
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>([]);
  const [salesData, setSalesData] = useState<SalesRecord[]>([]);
  const [purchaseData, setPurchaseData] = useState<PurchaseRecord[]>([]);
  const [sheetUrls, setSheetUrls] = useState<{ sales: string; purchase: string; expense: string }>({
    sales: '',
    purchase: '',
    expense: '',
  });
  const [lastSyncTimes, setLastSyncTimes] = useState<{ sales: string; purchase: string; expense: string }>({
    sales: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    purchase: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    expense: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [expRes, salesRes, purRes, configRes] = await Promise.all([
        fetch('/api/expenses').catch(() => null),
        fetch('/api/sales').catch(() => null),
        fetch('/api/purchase').catch(() => null),
        fetch('/api/config/sheet-urls').catch(() => null),
      ]);

      const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      if (expRes && expRes.ok) {
        const data = await expRes.json();
        setExpenseEntries(Array.isArray(data) ? data : []);
      }
      if (salesRes && salesRes.ok) {
        const data = await salesRes.json();
        setSalesData(Array.isArray(data) ? data : []);
      }
      if (purRes && purRes.ok) {
        const data = await purRes.json();
        setPurchaseData(Array.isArray(data) ? data : []);
      }

      setLastSyncTimes({
        sales: nowStr,
        purchase: nowStr,
        expense: nowStr,
      });

      if (configRes && configRes.ok) {
        const data = await configRes.json();
        if (data.sales && data.purchase && data.expense) {
          setSheetUrls(data);
        } else if (data.sheetUrls) {
          setSheetUrls(data.sheetUrls);
        }
      }
    } catch (err) {
      console.warn('API error, using initial local state:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Extract Brand Suggestions from Sales & Purchase data
  useEffect(() => {
    const set = new Set<string>();
    if (Array.isArray(salesData)) salesData.forEach((s) => s?.Transaction_Details && set.add(s.Transaction_Details));
    if (Array.isArray(purchaseData)) purchaseData.forEach((p) => p?.Transaction_Details && set.add(p.Transaction_Details));
    setBrandSuggestions(Array.from(set).sort());
  }, [salesData, purchaseData]);

  // Actions
  const handleAddEntry = async (entry: Partial<ExpenseEntry>): Promise<boolean> => {
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });

      if (res.ok) {
        const result = await res.json();
        showToast('✅ Entry added successfully!', 'success');
        fetchData();
        return true;
      } else {
        const err = await res.json();
        showToast(`❌ ${err.message || 'Error adding entry'}`, 'error');
        return false;
      }
    } catch {
      // Local fallback
      const newIndex = expenseEntries.length > 0 ? Math.max(...expenseEntries.map((e) => e.rowIndex)) + 1 : 2;
      const invoice = entry.invoice || 0;
      const credit = entry.credit || 0;
      const netValue = invoice - credit;

      const newEntry: ExpenseEntry = {
        rowIndex: newIndex,
        marketplace: entry.marketplace || 'Unknown',
        month: entry.month || 'Jan-2025',
        invoiceNumber: entry.invoiceNumber || '',
        name: entry.name || '',
        desc: entry.desc || '',
        invoice,
        credit,
        netValue,
      };

      setExpenseEntries((prev) => [...prev, newEntry]);
      showToast('✅ Entry saved locally!', 'success');
      return true;
    }
  };

  const handleDeleteEntry = async (rowIndex: number, mkt: string, inv: string) => {
    if (!window.confirm(`Kya aap ye entry delete karna chahte hain?\nMarketplace: ${mkt}\nInvoice: ${inv || 'N/A'}`)) {
      return;
    }

    try {
      const res = await fetch(`/api/expenses/${rowIndex}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('✅ Entry deleted successfully', 'success');
        fetchData();
      } else {
        showToast('❌ Error deleting entry', 'error');
      }
    } catch {
      setExpenseEntries((prev) => prev.filter((e) => e.rowIndex !== rowIndex));
      showToast('✅ Entry deleted locally', 'success');
    }
  };

  const handleClearAll = async () => {
    if (expenseEntries.length === 0) {
      showToast('Koi entry nahi hai', 'error');
      return;
    }
    if (!window.confirm('⚠️ Sab entries delete karni hain? Ye action undo nahi ho sakta.')) {
      return;
    }

    try {
      const res = await fetch('/api/expenses/clear', { method: 'POST' });
      if (res.ok) {
        setExpenseEntries([]);
        showToast('✅ Sab clear ho gaya', 'success');
      }
    } catch {
      setExpenseEntries([]);
      showToast('✅ Sab clear ho gaya', 'success');
    }
  };

  const handleResetSheet = async () => {
    if (!window.confirm('⚠️ Yeh sheet ko reset karke initial entries wapas laayega. Continue?')) {
      return;
    }

    try {
      const res = await fetch('/api/expenses/reset', { method: 'POST' });
      if (res.ok) {
        showToast('✅ Sheet reset ho gayi!', 'success');
        fetchData();
      }
    } catch {
      setExpenseEntries(INITIAL_EXPENSES);
      showToast('✅ Sheet reset ho gayi!', 'success');
    }
  };

  const handleBulkUpload = async (rows: any[][]): Promise<boolean> => {
    try {
      const res = await fetch('/api/expenses/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: rows }),
      });

      if (res.ok) {
        const result = await res.json();
        showToast(`✅ ${result.message}`, 'success');
        fetchData();
        return true;
      }
      return false;
    } catch {
      // Local bulk parse fallback
      let added = 0;
      const newItems: ExpenseEntry[] = [];
      rows.forEach((row, i) => {
        if (!row || (!row[0] && !row[1] && !row[4])) return;
        const mkt = String(row[0] || '').trim();
        const mon = String(row[1] || '').trim();
        const desc = String(row[4] || '').trim();
        if (!mkt || !mon || !desc) return;

        const invoice = parseFloat(row[5]) || 0;
        const credit = parseFloat(row[6]) || 0;
        const netValue = invoice - credit;

        newItems.push({
          rowIndex: 1000 + i,
          marketplace: mkt,
          month: mon,
          invoiceNumber: String(row[2] || '').trim(),
          name: String(row[3] || '').trim(),
          desc,
          invoice,
          credit,
          netValue,
        });
        added++;
      });

      setExpenseEntries((prev) => [...prev, ...newItems]);
      showToast(`✅ ${added} entries uploaded locally!`, 'success');
      return true;
    }
  };

  const handleSaveSheetUrls = async (newUrls: { sales: string; purchase: string; expense: string }) => {
    setSheetUrls(newUrls);
    try {
      await fetch('/api/config/sheet-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUrls),
      });
      showToast('Sheet URLs updated!', 'success');
    } catch {
      showToast('Sheet URLs updated locally!', 'success');
    }
  };

  const handleBulkUploadSales = async (rows: any[][]): Promise<boolean> => {
    try {
      const res = await fetch('/api/sales/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: rows }),
      });
      if (res.ok) {
        const result = await res.json();
        showToast(`✅ ${result.message}`, 'success');
        fetchData();
        return true;
      }
      return false;
    } catch {
      let added = 0;
      const newItems: SalesRecord[] = [];
      rows.forEach((row) => {
        if (!row || (!row[0] && !row[1] && !row[4])) return;
        const month = String(row[0] || '').trim();
        const channel = String(row[1] || '').trim();
        if (!month || !channel) return;
        newItems.push({
          Month: month,
          Channel: channel,
          Date: String(row[2] || '').trim(),
          Account_Name: String(row[3] || '').trim(),
          Transaction_Details: String(row[4] || '').trim(),
          Transaction_Type: String(row[5] || 'Invoice').trim(),
          Reference_Number: String(row[6] || '').trim(),
          Entity_Number: String(row[7] || '').trim(),
          Debit: parseFloat(row[8]) || 0,
          Credit: parseFloat(row[9]) || 0,
          Net_Amount: parseFloat(row[10]) || 0,
          Status: String(row[11] || 'Completed').trim(),
          'Final Status': String(row[12] || 'Paid').trim(),
          'Return Type': String(row[13] || '').trim(),
        });
        added++;
      });
      setSalesData((prev) => [...prev, ...newItems]);
      showToast(`✅ ${added} sales records uploaded locally!`, 'success');
      return true;
    }
  };

  const handleBulkUploadPurchase = async (rows: any[][]): Promise<boolean> => {
    try {
      const res = await fetch('/api/purchase/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: rows }),
      });
      if (res.ok) {
        const result = await res.json();
        showToast(`✅ ${result.message}`, 'success');
        fetchData();
        return true;
      }
      return false;
    } catch {
      let added = 0;
      const newItems: PurchaseRecord[] = [];
      rows.forEach((row) => {
        if (!row || (!row[0] && !row[1] && !row[4])) return;
        const month = String(row[0] || '').trim();
        const channel = String(row[1] || '').trim();
        if (!month || !channel) return;
        newItems.push({
          Month: month,
          Channel: channel,
          Date: String(row[2] || '').trim(),
          Account_Name: String(row[3] || '').trim(),
          Transaction_Details: String(row[4] || '').trim(),
          Transaction_Type: String(row[5] || 'Bill').trim(),
          Reference_Number: String(row[6] || '').trim(),
          Entity_Number: String(row[7] || '').trim(),
          Debit: parseFloat(row[8]) || 0,
          Credit: parseFloat(row[9]) || 0,
          Net_Amount: parseFloat(row[10]) || 0,
          Status: String(row[11] || 'Completed').trim(),
          'Final Status': String(row[12] || 'Paid').trim(),
          'Return Type': String(row[13] || '').trim(),
        });
        added++;
      });
      setPurchaseData((prev) => [...prev, ...newItems]);
      showToast(`✅ ${added} purchase records uploaded locally!`, 'success');
      return true;
    }
  };

  const handleResetSales = async () => {
    try {
      await fetch('/api/sales/reset', { method: 'POST' });
      fetchData();
      showToast('Sales data reset!', 'success');
    } catch {
      setSalesData(INITIAL_SALES);
      showToast('Sales data reset locally!', 'success');
    }
  };

  const handleResetPurchase = async () => {
    try {
      await fetch('/api/purchase/reset', { method: 'POST' });
      fetchData();
      showToast('Purchase data reset!', 'success');
    } catch {
      setPurchaseData(INITIAL_PURCHASE);
      showToast('Purchase data reset locally!', 'success');
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] p-3 sm:p-5 font-sans">
      <div className="max-w-[1600px] mx-auto">
        <Header
          sheetUrls={sheetUrls}
          entryCount={expenseEntries.length}
          onOpenModal={() => setIsModalOpen(true)}
          lastSyncTimes={lastSyncTimes}
          onRefreshData={fetchData}
          isRefreshing={isRefreshing}
        />

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-5">
          <div className="flex bg-[#f8fafc] border-b border-gray-200 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('pl')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === 'pl'
                  ? 'border-[#2d5a5a] text-[#2d5a5a] bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
              }`}
            >
              📈 P/L Analysis
            </button>

            <button
              onClick={() => setActiveTab('sales')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === 'sales'
                  ? 'border-[#2d5a5a] text-[#2d5a5a] bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
              }`}
            >
              💰 Sales
            </button>

            <button
              onClick={() => setActiveTab('purchase')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === 'purchase'
                  ? 'border-[#2d5a5a] text-[#2d5a5a] bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
              }`}
            >
              🛒 Purchase
            </button>

            <button
              onClick={() => setActiveTab('expense')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === 'expense'
                  ? 'border-[#2d5a5a] text-[#2d5a5a] bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
              }`}
            >
              📋 Expense Data
            </button>

            <button
              onClick={() => setActiveTab('summary')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === 'summary'
                  ? 'border-[#2d5a5a] text-[#2d5a5a] bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
              }`}
            >
              📊 Summary
            </button>

            <button
              onClick={() => setActiveTab('outstanding')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === 'outstanding'
                  ? 'border-[#2d5a5a] text-[#2d5a5a] bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
              }`}
            >
              ⏳ Outstanding
            </button>

            <button
              onClick={() => setActiveTab('manual')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === 'manual'
                  ? 'border-[#2d5a5a] text-[#2d5a5a] bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
              }`}
            >
              📝 Manual Entry
            </button>

            <button
              onClick={() => setActiveTab('panel')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeTab === 'panel'
                  ? 'border-[#2d5a5a] text-[#2d5a5a] bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
              }`}
            >
              🖥️ Panel Data
            </button>
          </div>

          {/* Active Tab View */}
          <div className="p-2 sm:p-4">
            <TabErrorBoundary key={activeTab} tabName={activeTab}>
              {activeTab === 'sales' && (
                <SalesDashboard
                  salesData={Array.isArray(salesData) ? salesData : []}
                  onBulkUpload={handleBulkUploadSales}
                  onResetSales={handleResetSales}
                />
              )}
              {activeTab === 'purchase' && (
                <PurchaseDashboard
                  purchaseData={Array.isArray(purchaseData) ? purchaseData : []}
                  onBulkUpload={handleBulkUploadPurchase}
                  onResetPurchase={handleResetPurchase}
                />
              )}
              {activeTab === 'expense' && (
                <ExpenseData
                  entries={Array.isArray(expenseEntries) ? expenseEntries : []}
                  onDelete={handleDeleteEntry}
                  onRefresh={fetchData}
                  onClearAll={handleClearAll}
                  onResetSheet={handleResetSheet}
                />
              )}
              {activeTab === 'summary' && (
                <SummaryTab expenses={Array.isArray(expenseEntries) ? expenseEntries : []} onRefresh={fetchData} />
              )}
              {activeTab === 'pl' && (
                <PLAnalysis
                  salesData={Array.isArray(salesData) ? salesData : []}
                  purchaseData={Array.isArray(purchaseData) ? purchaseData : []}
                  expenseData={Array.isArray(expenseEntries) ? expenseEntries : []}
                />
              )}
              {activeTab === 'outstanding' && (
                <OutstandingDashboard
                  salesData={Array.isArray(salesData) ? salesData : []}
                  purchaseData={Array.isArray(purchaseData) ? purchaseData : []}
                />
              )}
              {activeTab === 'manual' && (
                <ManualEntry
                  onAddEntry={handleAddEntry}
                  onBulkUpload={handleBulkUpload}
                  brandSuggestions={brandSuggestions}
                />
              )}
              {activeTab === 'panel' && (
                <PanelDataDashboard onClose={() => setActiveTab('sales')} />
              )}
            </TabErrorBoundary>
          </div>
        </div>
      </div>

      <SheetUrlModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        sheetUrls={sheetUrls}
        onSave={handleSaveSheetUrls}
        onDataImported={fetchData}
      />

      <ToastContainer toasts={toasts} />
    </div>
  );
}
