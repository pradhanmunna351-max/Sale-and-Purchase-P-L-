import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Database,
  Server,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  HardDrive,
  KeyRound,
  Play,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Cpu,
  UploadCloud,
  FileSpreadsheet,
  Radio,
  Timer,
  HeartHandshake,
  Check,
  FileCheck2,
  AlertCircle,
} from 'lucide-react';
import { MongoStatusInfo, ParallelQueryBenchmarkResult, AutoSyncConfig, KeepAliveConfig, SchemaValidationDiagnostic } from '../types';

interface MongoStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData?: () => void;
}

export const MongoStatusModal: React.FC<MongoStatusModalProps> = ({
  isOpen,
  onClose,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'autosync' | 'directseed' | 'diagnostics' | 'keepalive'>('overview');
  const [status, setStatus] = useState<MongoStatusInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [customUriInput, setCustomUriInput] = useState('');
  const [isUpdatingUri, setIsUpdatingUri] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Parallel Query Benchmark State
  const [benchmark, setBenchmark] = useState<ParallelQueryBenchmarkResult | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Diagnostic Schema State
  const [diagCollection, setDiagCollection] = useState<'sales' | 'purchases' | 'expenses' | 'payments'>('sales');
  const [diagResult, setDiagResult] = useState<SchemaValidationDiagnostic | null>(null);
  const [isValidatingSchema, setIsValidatingSchema] = useState(false);

  // Auto-Sync & KeepAlive states
  const [autoSync, setAutoSync] = useState<AutoSyncConfig | null>(null);
  const [keepAlive, setKeepAlive] = useState<KeepAliveConfig | null>(null);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [isPingingNow, setIsPingingNow] = useState(false);

  // Direct Seed / Upload File State
  const [seedCategory, setSeedCategory] = useState<'sales' | 'purchase' | 'expense' | 'payment'>('sales');
  const [seedFile, setSeedFile] = useState<File | null>(null);
  const [seedReplace, setSeedReplace] = useState(true);
  const [isUploadingSeed, setIsUploadingSeed] = useState(false);
  const [seedProgressMsg, setSeedProgressMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [statusRes, cronRes] = await Promise.allSettled([
        fetch('/api/mongodb/status').then((r) => r.json()),
        fetch('/api/cron/status').then((r) => r.json()),
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value.success) {
        setStatus(statusRes.value.status);
      }
      if (cronRes.status === 'fulfilled' && cronRes.value.success) {
        setAutoSync(cronRes.value.autoSync);
        setKeepAlive(cronRes.value.keepAlive);
      }
    } catch (e) {
      console.warn('Failed to fetch MongoDB or Cron status:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setUpdateMessage(null);
      setSeedProgressMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnectWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim() && !customUriInput.trim()) return;

    setIsUpdatingUri(true);
    setUpdateMessage(null);

    try {
      const res = await fetch('/api/mongodb/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: passwordInput.trim() || undefined,
          uri: customUriInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUpdateMessage({ text: '✅ ' + data.message, type: 'success' });
        setStatus(data.status);
        setPasswordInput('');
        if (onRefreshData) onRefreshData();
      } else {
        setUpdateMessage({ text: '❌ ' + (data.message || 'Connection failed. Check network or credentials.'), type: 'error' });
        if (data.status) setStatus(data.status);
      }
    } catch (err: any) {
      setUpdateMessage({ text: '❌ Network error while connecting to MongoDB server.', type: 'error' });
    } finally {
      setIsUpdatingUri(false);
    }
  };

  const handleRunBenchmark = async () => {
    setIsBenchmarking(true);
    try {
      const res = await fetch('/api/parallel-summary');
      const data = await res.json();
      if (data.success && data.benchmark) {
        setBenchmark(data.benchmark);
      }
    } catch (e) {
      console.warn('Benchmark error:', e);
    } finally {
      setIsBenchmarking(false);
    }
  };

  const handleRunDiagnosticSchemaCheck = async (collection: 'sales' | 'purchases' | 'expenses' | 'payments') => {
    setIsValidatingSchema(true);
    setDiagCollection(collection);
    try {
      const res = await fetch('/api/mongodb/diagnostics/validate-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection }),
      });
      const data = await res.json();
      if (data.success && data.diagnostics) {
        setDiagResult(data.diagnostics);
      }
    } catch (e) {
      console.warn('Diagnostic check failed:', e);
    } finally {
      setIsValidatingSchema(false);
    }
  };

  const handleTriggerAutoSync = async () => {
    setIsSyncingNow(true);
    try {
      const res = await fetch('/api/cron/auto-sync/trigger', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setUpdateMessage({ text: `✅ Auto-Sync Completed! Ingested: ${data.message}`, type: 'success' });
        fetchStatus();
        if (onRefreshData) onRefreshData();
      } else {
        setUpdateMessage({ text: `❌ Auto-sync error: ${data.message}`, type: 'error' });
      }
    } catch {
      setUpdateMessage({ text: '❌ Failed to execute auto-sync', type: 'error' });
    } finally {
      setIsSyncingNow(false);
    }
  };

  const handleUpdateAutoSyncConfig = async (enabled: boolean, intervalMinutes: number) => {
    try {
      const res = await fetch('/api/cron/auto-sync/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, intervalMinutes }),
      });
      const data = await res.json();
      if (data.success) {
        setAutoSync(data.autoSync);
      }
    } catch {}
  };

  const handlePingKeepAliveNow = async () => {
    setIsPingingNow(true);
    try {
      const res = await fetch('/api/cron/keep-alive/ping-now', { method: 'POST' });
      const data = await res.json();
      if (data.keepAlive) {
        setKeepAlive(data.keepAlive);
        setUpdateMessage({ text: `💓 Keep-Alive Ping successful (${data.keepAlive.lastPingLatencyMs}ms)`, type: 'success' });
      }
    } catch {
      setUpdateMessage({ text: '❌ Ping failed', type: 'error' });
    } finally {
      setIsPingingNow(false);
    }
  };

  const handleUpdateKeepAliveConfig = async (enabled: boolean, intervalMinutes: number, targetUrl: string) => {
    try {
      const res = await fetch('/api/cron/keep-alive/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, intervalMinutes, targetUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setKeepAlive(data.keepAlive);
      }
    } catch {}
  };

  const handleDirectSeedUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seedFile) {
      setSeedProgressMsg('❌ Please select a CSV file first');
      return;
    }

    setIsUploadingSeed(true);
    setSeedProgressMsg('Reading file and streaming chunked data to MongoDB Atlas...');

    try {
      const text = await seedFile.text();
      const res = await fetch('/api/direct-seed-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: seedCategory,
          csvContent: text,
          replaceExisting: seedReplace,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSeedProgressMsg(`✅ Direct Seed Success! Ingested ${data.totalRecords} records into ${seedCategory.toUpperCase()} (${data.throughputPerSec} recs/sec)`);
        setSeedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchStatus();
        if (onRefreshData) onRefreshData();
      } else {
        setSeedProgressMsg(`❌ Direct Seed Failed: ${data.message}`);
      }
    } catch (err: any) {
      setSeedProgressMsg(`❌ Direct Seed Error: ${err.message}`);
    } finally {
      setIsUploadingSeed(false);
    }
  };

  const isConnected = status?.connected || false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-gray-100 flex flex-col max-h-[94vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#001e2b] via-[#023430] to-[#00684a] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shadow-inner">
              <Database size={22} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-wide">MongoDB Atlas & Cloud Engine</h2>
                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                  Atlas Cluster0
                </span>
              </div>
              <p className="text-xs text-emerald-100/80">
                Direct Database Seeding • 24/7 Render Keep-Alive • Auto-Sync Google Sheets
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center bg-gray-100 px-6 border-b border-gray-200 text-xs font-bold text-gray-600 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-emerald-600 text-emerald-800 bg-white shadow-2xs font-extrabold'
                : 'border-transparent hover:text-gray-900'
            }`}
          >
            <Database size={14} /> Database Overview & Benchmark
          </button>

          <button
            onClick={() => setActiveTab('autosync')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'autosync'
                ? 'border-emerald-600 text-emerald-800 bg-white shadow-2xs font-extrabold'
                : 'border-transparent hover:text-gray-900'
            }`}
          >
            <RefreshCw size={14} /> 🔄 Auto-Sync Cron (No Manual Sync)
          </button>

          <button
            onClick={() => setActiveTab('directseed')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'directseed'
                ? 'border-emerald-600 text-emerald-800 bg-white shadow-2xs font-extrabold'
                : 'border-transparent hover:text-gray-900'
            }`}
          >
            <UploadCloud size={14} /> ⚡ Direct Data Seeder
          </button>

          <button
            onClick={() => {
              setActiveTab('diagnostics');
              if (!diagResult) handleRunDiagnosticSchemaCheck('sales');
            }}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'diagnostics'
                ? 'border-emerald-600 text-emerald-800 bg-white shadow-2xs font-extrabold'
                : 'border-transparent hover:text-gray-900'
            }`}
          >
            <FileCheck2 size={14} /> 🔍 Schema Diagnostics
          </button>

          <button
            onClick={() => setActiveTab('keepalive')}
            className={`py-3 px-3.5 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === 'keepalive'
                ? 'border-emerald-600 text-emerald-800 bg-white shadow-2xs font-extrabold'
                : 'border-transparent hover:text-gray-900'
            }`}
          >
            <Radio size={14} /> 💓 Render 24/7 Keep-Alive
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-gray-800 flex-1">
          {updateMessage && (
            <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between animate-in fade-in ${
              updateMessage.type === 'success' ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' : 'bg-red-100 text-red-900 border border-red-200'
            }`}>
              <span>{updateMessage.text}</span>
              <button onClick={() => setUpdateMessage(null)} className="text-gray-500 hover:text-gray-800">
                <X size={14} />
              </button>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 1: OVERVIEW & BENCHMARK */}
          {/* ========================================================= */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Status Top Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                  isConnected
                    ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                    : 'bg-amber-50/90 border-amber-200 text-amber-950'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-gray-500">Atlas Cluster State</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${
                      isConnected ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                    }`}>
                      {isConnected ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                      {isConnected ? 'Connected' : 'Connecting / In-Memory'}
                    </span>
                  </div>
                  <div className="text-lg font-black tracking-tight truncate">
                    {status?.databaseName || 'business_ledger_db'}
                  </div>
                  <div className="text-[11px] text-gray-600 mt-1 truncate">
                    Host: <span className="font-mono font-semibold">cluster0.dwrw0lm.mongodb.net</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/80 text-blue-950 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-blue-700">Total MongoDB Documents</span>
                    <HardDrive size={14} className="text-blue-600" />
                  </div>
                  <div className="text-2xl font-black text-blue-950">
                    {(status?.totalDocuments || 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-blue-800 font-medium mt-1">
                    Indexed Across 4 Primary Collections
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/80 text-purple-950 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-purple-700">Query Engine Latency</span>
                    <Cpu size={14} className="text-purple-600" />
                  </div>
                  <div className="text-xl font-black text-purple-950 flex items-center gap-1">
                    <span>⚡ {status?.lastPingLatencyMs || 2} ms</span>
                  </div>
                  <div className="text-[11px] text-purple-800 font-medium mt-1">
                    Max Pool: {status?.connectionPool.maxPoolSize || 50} • Auto Reconnect Active
                  </div>
                </div>
              </div>

              {/* Collections Grid */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
                    <Layers size={14} className="text-blue-600" /> Live MongoDB Collections & Indexes
                  </h3>
                  <button
                    onClick={fetchStatus}
                    disabled={loading}
                    className="text-[11px] font-bold text-gray-600 hover:text-emerald-700 flex items-center gap-1"
                  >
                    <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh Counts
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-2xs">
                    <div className="text-[11px] font-bold text-blue-700 flex justify-between items-center mb-1">
                      <span>💰 sales</span>
                      <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-bold">6 Indexes</span>
                    </div>
                    <div className="text-lg font-black text-gray-900">
                      {(status?.collections?.sales?.count || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-400">Sales Invoices & Returns</div>
                  </div>

                  <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-2xs">
                    <div className="text-[11px] font-bold text-red-700 flex justify-between items-center mb-1">
                      <span>🛒 purchases</span>
                      <span className="text-[9px] bg-red-100 text-red-800 px-1.5 py-0.2 rounded font-bold">6 Indexes</span>
                    </div>
                    <div className="text-lg font-black text-gray-900">
                      {(status?.collections?.purchases?.count || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-400">Vendor Bills & Credits</div>
                  </div>

                  <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-2xs">
                    <div className="text-[11px] font-bold text-amber-700 flex justify-between items-center mb-1">
                      <span>📋 expenses</span>
                      <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">4 Indexes</span>
                    </div>
                    <div className="text-lg font-black text-gray-900">
                      {(status?.collections?.expenses?.count || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-400">Ledger Marketplace Fees</div>
                  </div>

                  <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-2xs">
                    <div className="text-[11px] font-bold text-emerald-700 flex justify-between items-center mb-1">
                      <span>💸 payments</span>
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold">4 Indexes</span>
                    </div>
                    <div className="text-lg font-black text-gray-900">
                      {(status?.collections?.payments?.count || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-400">Bank Entry Credits</div>
                  </div>
                </div>
              </div>

              {/* Parallel Aggregation Benchmark */}
              <div className="bg-gradient-to-r from-slate-900 via-[#132226] to-[#0f1f1d] text-white rounded-xl p-4.5 border border-slate-700 shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-700/80">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                    <h3 className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                      <Zap size={14} className="text-yellow-400" /> Fast Parallel Query Execution Benchmark
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunBenchmark}
                    disabled={isBenchmarking}
                    className="px-3 py-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 active:scale-95 text-white text-[11px] font-black rounded-lg transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    {isBenchmarking ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" />
                        <span>Executing 4 Parallel Streams...</span>
                      </>
                    ) : (
                      <>
                        <Play size={12} />
                        <span>⚡ Run Live Parallel Query</span>
                      </>
                    )}
                  </button>
                </div>

                {benchmark ? (
                  <div className="space-y-2.5 text-xs animate-in fade-in duration-200">
                    <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-lg border border-white/10">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-emerald-400" />
                        <span className="font-bold text-white">4 Aggregations Completed in:</span>
                      </div>
                      <span className="text-base font-black text-emerald-300 font-mono">
                        ⚡ {benchmark.executionTimeMs} ms
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div className="bg-white/5 p-2 rounded-lg border border-white/10">
                        <span className="text-gray-400 block text-[10px]">Gross Sales</span>
                        <span className="font-bold text-sky-300">₹ {benchmark.totalGrossSales.toLocaleString()}</span>
                      </div>
                      <div className="bg-white/5 p-2 rounded-lg border border-white/10">
                        <span className="text-gray-400 block text-[10px]">Gross Purchases</span>
                        <span className="font-bold text-rose-300">₹ {benchmark.totalGrossPurchases.toLocaleString()}</span>
                      </div>
                      <div className="bg-white/5 p-2 rounded-lg border border-white/10">
                        <span className="text-gray-400 block text-[10px]">Net Expenses</span>
                        <span className="font-bold text-amber-300">₹ {benchmark.totalNetExpenses.toLocaleString()}</span>
                      </div>
                      <div className="bg-white/5 p-2 rounded-lg border border-white/10">
                        <span className="text-gray-400 block text-[10px]">Bank Payments</span>
                        <span className="font-bold text-emerald-300">₹ {benchmark.totalPayments.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Click <strong>"Run Live Parallel Query"</strong> to benchmark 4 concurrent MongoDB aggregation pipelines across Sales, Purchase, Expenses, and Payments.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: AUTOMATIC BACKGROUND SYNC CRON (NO MANUAL SYNC) */}
          {/* ========================================================= */}
          {activeTab === 'autosync' && (
            <div className="space-y-4">
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-4 text-emerald-950">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Timer size={18} className="text-emerald-700 animate-spin" />
                    <h3 className="text-sm font-black">Automated Google Sheet Background Sync</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-extrabold">
                    {autoSync?.enabled ? 'Active Cron' : 'Disabled'}
                  </span>
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  The background cron automatically pulls the latest Google Sheets data into MongoDB at scheduled intervals. All edits made in your Google Sheets will auto-reflect in MongoDB without any manual button clicking!
                </p>
              </div>

              {/* Auto Sync Settings & Controls */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Cron Interval (Minutes)
                    </label>
                    <select
                      value={autoSync?.intervalMinutes || 10}
                      onChange={(e) =>
                        handleUpdateAutoSyncConfig(
                          autoSync?.enabled ?? true,
                          parseInt(e.target.value, 10)
                        )
                      }
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2 text-xs font-semibold focus:outline-hidden focus:border-emerald-500"
                    >
                      <option value={1}>Every 1 Minute (Ultra Fast)</option>
                      <option value={5}>Every 5 Minutes (Recommended)</option>
                      <option value={10}>Every 10 Minutes (Standard)</option>
                      <option value={30}>Every 30 Minutes</option>
                      <option value={60}>Every 1 Hour</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Background Auto-Sync Status
                    </label>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateAutoSyncConfig(
                            !(autoSync?.enabled ?? true),
                            autoSync?.intervalMinutes || 10
                          )
                        }
                        className={`px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                          autoSync?.enabled
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {autoSync?.enabled ? '✓ Auto-Sync ENABLED' : '✗ Auto-Sync DISABLED'}
                      </button>
                      <button
                        type="button"
                        onClick={handleTriggerAutoSync}
                        disabled={isSyncingNow}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-98 disabled:bg-gray-300 text-white rounded-lg text-xs font-black flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                      >
                        <RefreshCw size={12} className={isSyncingNow ? 'animate-spin' : ''} />
                        <span>{isSyncingNow ? 'Syncing Now...' : 'Trigger Sync Now'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 text-xs">
                  <div className="bg-gray-50 p-2.5 rounded-lg">
                    <span className="text-gray-400 block text-[10px]">Last Auto-Sync Time</span>
                    <span className="font-bold text-gray-800">{autoSync?.lastAutoSyncTime || 'Pending First Cycle'}</span>
                  </div>
                  <div className="bg-gray-50 p-2.5 rounded-lg">
                    <span className="text-gray-400 block text-[10px]">Next Scheduled Sync</span>
                    <span className="font-bold text-emerald-700">{autoSync?.nextAutoSyncTime || 'Calculating...'}</span>
                  </div>
                </div>
              </div>

              {/* Sync History Logs */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-gray-700 mb-2">
                  Recent Auto-Sync Execution Logs
                </h4>
                <div className="bg-gray-900 text-emerald-300 font-mono text-[11px] p-3.5 rounded-xl max-h-48 overflow-y-auto space-y-1 shadow-inner">
                  {autoSync?.syncHistory && autoSync.syncHistory.length > 0 ? (
                    autoSync.syncHistory.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between border-b border-gray-800/80 pb-1">
                        <span className="text-gray-400">[{item.timestamp}]</span>
                        <span className={item.success ? 'text-emerald-400' : 'text-red-400'}>{item.message}</span>
                        <span className="text-yellow-400">{item.elapsedMs}ms</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-400 italic">No sync cycles logged yet. Next cycle running shortly...</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: DIRECT SEED / UPLOAD RAW CSV DIRECTLY */}
          {/* ========================================================= */}
          {activeTab === 'directseed' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-950">
                <div className="flex items-center gap-2 mb-1">
                  <UploadCloud size={18} className="text-blue-700" />
                  <h3 className="text-sm font-black">Direct File Seeder & Database Ingestion</h3>
                </div>
                <p className="text-xs text-blue-800 leading-relaxed">
                  Upload CSV files directly into MongoDB Atlas without needing manual link synchronization. The engine automatically processes, validates datatypes, and chunk-inserts records directly into the target collection.
                </p>
              </div>

              <form onSubmit={handleDirectSeedUpload} className="bg-white border border-gray-200 rounded-xl p-4.5 shadow-2xs space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Target MongoDB Collection
                    </label>
                    <select
                      value={seedCategory}
                      onChange={(e) => setSeedCategory(e.target.value as any)}
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2 text-xs font-bold text-gray-800 focus:outline-hidden focus:border-blue-500"
                    >
                      <option value="sales">Sales Invoices (sales collection)</option>
                      <option value="purchase">Purchase Bills (purchases collection)</option>
                      <option value="expense">Marketplace Expenses (expenses collection)</option>
                      <option value="payment">Bank Payments (payments collection)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Ingestion Mode
                    </label>
                    <div className="flex items-center gap-2 pt-2">
                      <label className="flex items-center gap-1.5 text-xs text-gray-800 cursor-pointer">
                        <input
                          type="radio"
                          name="seedMode"
                          checked={seedReplace}
                          onChange={() => setSeedReplace(true)}
                        />
                        <span className="font-bold text-blue-800">Replace existing records</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-gray-800 cursor-pointer ml-3">
                        <input
                          type="radio"
                          name="seedMode"
                          checked={!seedReplace}
                          onChange={() => setSeedReplace(false)}
                        />
                        <span className="font-bold text-gray-700">Append records</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Select CSV File to Seed
                  </label>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSeedFile(e.target.files[0]);
                      }
                    }}
                    className="w-full text-xs text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-gray-200 rounded-lg p-1.5"
                  />
                </div>

                {seedProgressMsg && (
                  <div className={`p-3 rounded-lg text-xs font-bold ${
                    seedProgressMsg.startsWith('✅') ? 'bg-emerald-100 text-emerald-900' : seedProgressMsg.startsWith('❌') ? 'bg-red-100 text-red-900' : 'bg-blue-100 text-blue-900'
                  }`}>
                    {seedProgressMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isUploadingSeed || !seedFile}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-98 disabled:bg-gray-300 text-white font-extrabold text-xs rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isUploadingSeed ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Streaming Chunks into MongoDB...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={15} />
                      <span>⚡ Seed Data Directly into Database</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: SCHEMA VALIDATION DIAGNOSTICS */}
          {/* ========================================================= */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-950">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <FileCheck2 size={18} className="text-emerald-700" />
                    <h3 className="text-sm font-black">MongoDB 'business_ledger_db' Schema Diagnostics</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-700 text-white text-[11px] font-extrabold">
                    Real-time Audit
                  </span>
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  Deeply analyzes records in database collections or incoming bulk payloads against strict schema rules (datatypes, required indices, numeric constraints).
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-4.5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    {(['sales', 'purchases', 'expenses', 'payments'] as const).map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => handleRunDiagnosticSchemaCheck(col)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                          diagCollection === col
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {col}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRunDiagnosticSchemaCheck(diagCollection)}
                    disabled={isValidatingSchema}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:bg-gray-300"
                  >
                    <RefreshCw size={12} className={isValidatingSchema ? 'animate-spin' : ''} />
                    <span>Re-Audit Schema</span>
                  </button>
                </div>

                {diagResult ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-gray-50 border border-gray-100 p-3 rounded-lg text-center">
                        <span className="text-[10px] text-gray-400 font-bold block uppercase">Collection</span>
                        <span className="text-xs font-black text-gray-800 uppercase">{diagResult.collection}</span>
                      </div>
                      <div className="bg-gray-50 border border-gray-100 p-3 rounded-lg text-center">
                        <span className="text-[10px] text-gray-400 font-bold block uppercase">Documents Checked</span>
                        <span className="text-xs font-black text-blue-700">{diagResult.totalChecked.toLocaleString()}</span>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-center">
                        <span className="text-[10px] text-emerald-600 font-bold block uppercase">Valid Schema</span>
                        <span className="text-xs font-black text-emerald-700">{diagResult.validCount.toLocaleString()}</span>
                      </div>
                      <div className={`${diagResult.invalidCount > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'} border p-3 rounded-lg text-center`}>
                        <span className="text-[10px] text-gray-400 font-bold block uppercase">Schema Errors</span>
                        <span className={`text-xs font-black ${diagResult.invalidCount > 0 ? 'text-red-700' : 'text-gray-500'}`}>{diagResult.invalidCount}</span>
                      </div>
                    </div>

                    {diagResult.isValid ? (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-3.5 text-xs font-bold flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                        <span>All {diagResult.totalChecked.toLocaleString()} documents in collection '{diagResult.collection}' conform to the MongoDB schema.</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
                          <AlertCircle size={16} className="text-red-600 shrink-0" />
                          <span>Found {diagResult.invalidCount} schema anomalies during write validation.</span>
                        </div>
                        <div className="bg-gray-900 text-red-300 font-mono text-[11px] p-3 rounded-xl max-h-48 overflow-y-auto space-y-1.5 shadow-inner">
                          {diagResult.errors.map((err, idx) => (
                            <div key={idx} className="border-b border-gray-800 pb-1">
                              <span className="text-yellow-400 font-bold">[Row #{err.index + 1} ({err.recordSummary})]: </span>
                              <span>{err.details}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-gray-400">Click a collection to inspect schema compliance</div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 5: RENDER 24/7 KEEP-ALIVE CRON */}
          {/* ========================================================= */}
          {activeTab === 'keepalive' && (
            <div className="space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-purple-950">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Radio size={18} className="text-purple-700 animate-pulse" />
                    <h3 className="text-sm font-black">24/7 Render Keep-Alive Service</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-purple-600 text-white text-[11px] font-extrabold">
                    {keepAlive?.enabled ? 'Active Always-On' : 'Disabled'}
                  </span>
                </div>
                <p className="text-xs text-purple-800 leading-relaxed">
                  Render free-tier web services go to sleep after 15 minutes of inactivity. This built-in cron sends background heartbeat pings to <code>/api/health</code> to ensure zero cold starts and 100% database responsiveness 24/7.
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-4.5 shadow-2xs space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Render Service / App URL
                    </label>
                    <input
                      type="text"
                      value={keepAlive?.targetUrl || ''}
                      onChange={(e) =>
                        setKeepAlive(keepAlive ? { ...keepAlive, targetUrl: e.target.value } : null)
                      }
                      placeholder="https://your-app.onrender.com"
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2 text-xs font-mono focus:outline-hidden focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Heartbeat Frequency
                    </label>
                    <select
                      value={keepAlive?.intervalMinutes || 5}
                      onChange={(e) =>
                        handleUpdateKeepAliveConfig(
                          keepAlive?.enabled ?? true,
                          parseInt(e.target.value, 10),
                          keepAlive?.targetUrl || ''
                        )
                      }
                      className="w-full bg-gray-50 border border-gray-300 rounded-lg p-2 text-xs font-bold focus:outline-hidden"
                    >
                      <option value={2}>Every 2 Minutes (Max Reliability)</option>
                      <option value={5}>Every 5 Minutes (Recommended)</option>
                      <option value={10}>Every 10 Minutes</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateKeepAliveConfig(
                        !(keepAlive?.enabled ?? true),
                        keepAlive?.intervalMinutes || 5,
                        keepAlive?.targetUrl || ''
                      )
                    }
                    className={`px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      keepAlive?.enabled
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {keepAlive?.enabled ? '✓ Keep-Alive ALWAYS ON' : '✗ Keep-Alive OFF'}
                  </button>

                  <button
                    type="button"
                    onClick={handlePingKeepAliveNow}
                    disabled={isPingingNow}
                    className="px-4 py-2 bg-purple-700 hover:bg-purple-800 active:scale-98 disabled:bg-gray-300 text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Activity size={13} className={isPingingNow ? 'animate-spin' : ''} />
                    <span>{isPingingNow ? 'Pinging...' : 'Send Heartbeat Ping Now'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-xs">
                  <div className="bg-gray-50 p-2 rounded-lg">
                    <span className="text-gray-400 block text-[10px]">Total Pings Sent</span>
                    <span className="font-bold text-purple-900">{keepAlive?.pingsSent || 0}</span>
                  </div>
                  <div className="bg-gray-50 p-2 rounded-lg">
                    <span className="text-gray-400 block text-[10px]">Last Heartbeat</span>
                    <span className="font-bold text-purple-900">{keepAlive?.lastPingTime || 'Starting...'}</span>
                  </div>
                  <div className="bg-gray-50 p-2 rounded-lg">
                    <span className="text-gray-400 block text-[10px]">Latency</span>
                    <span className="font-bold text-emerald-600">{keepAlive?.lastPingLatencyMs || 0} ms</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 text-gray-500 text-[11px]">
            <span>MongoDB: <strong className="text-emerald-700">{status?.connected ? 'Atlas Connected' : 'Memory Cache Fallback'}</strong></span>
            <span>•</span>
            <span>Auto-Sync: <strong className="text-blue-700">{autoSync?.enabled ? `Every ${autoSync.intervalMinutes}m` : 'Off'}</strong></span>
            <span>•</span>
            <span>Render: <strong className="text-purple-700">{keepAlive?.enabled ? 'Always-On' : 'Off'}</strong></span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-gray-800 hover:bg-gray-900 text-white font-bold rounded-lg transition-colors shadow-xs text-xs cursor-pointer"
          >
            Close Hub
          </button>
        </div>
      </div>
    </div>
  );
};
