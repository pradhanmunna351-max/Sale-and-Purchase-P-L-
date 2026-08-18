export interface ExpenseEntry {
  rowIndex: number;
  marketplace: string;
  month: string;
  invoiceNumber: string;
  name: string;
  desc: string;
  invoice: number;
  credit: number;
  netValue: number;
}

export interface SalesRecord {
  Month: string;
  Channel: string;
  Date: string;
  Account_Name: string;
  Transaction_Details: string;
  Transaction_Type: string;
  Reference_Number: string;
  Entity_Number: string;
  Debit: number;
  Credit: number;
  Net_Amount: number;
  Status: string;
  'Final Status': string;
  'Return Type': string;
  Outstanding_Balance?: number;
  Document_Status?: string;
}

export interface PurchaseRecord {
  Month: string;
  Channel: string;
  Date: string;
  Account_Name: string;
  Transaction_Details: string;
  Transaction_Type: string;
  Reference_Number: string;
  Entity_Number: string;
  Debit: number;
  Credit: number;
  Net_Amount: number;
  Status: string;
  'Final Status': string;
  'Return Type': string;
  Outstanding_Balance?: number;
  Document_Status?: string;
}

export interface PaymentRecord {
  Payment_No: string;
  Bank_Entry_Date: string;
  Description: string;
  Amount: number;
  Channel: string;
  Month: string;
}

export interface FilterState {
  channel: string;
  month: string;
  year: string;
}

export interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

export interface MongoCollectionStats {
  name: string;
  count: number;
  sizeBytes: number;
  avgObjSize: number;
  indexesCount: number;
}

export interface MongoStatusInfo {
  connected: boolean;
  state: 'connected' | 'connecting' | 'disconnected' | 'fallback_memory' | 'error';
  databaseName: string;
  uriMasked: string;
  collections: {
    sales: MongoCollectionStats;
    purchases: MongoCollectionStats;
    expenses: MongoCollectionStats;
    payments: MongoCollectionStats;
    configs: MongoCollectionStats;
  };
  totalDocuments: number;
  connectionPool: {
    maxPoolSize: number;
    minPoolSize: number;
    activeConnections: number;
  };
  parallelWorkerConfig: {
    chunkSize: number;
    maxConcurrency: number;
  };
  lastPingLatencyMs: number;
  lastSyncTime: string;
  errorMessage?: string;
}

export interface ChunkUploadProgress {
  totalRecords: number;
  chunkSize: number;
  totalChunks: number;
  processedChunks: number;
  processedRecords: number;
  currentWorkerCount: number;
  percent: number;
  throughputPerSec: number;
  elapsedMs: number;
  status: 'idle' | 'chunking' | 'uploading' | 'indexing' | 'completed' | 'failed';
  error?: string;
}

export interface ParallelQueryBenchmarkResult {
  executionTimeMs: number;
  queriesRun: string[];
  salesCount: number;
  purchaseCount: number;
  expenseCount: number;
  paymentCount: number;
  totalGrossSales: number;
  totalGrossPurchases: number;
  totalNetExpenses: number;
  totalPayments: number;
  calculatedAt: string;
}

export interface AutoSyncConfig {
  enabled: boolean;
  intervalMinutes: number;
  lastAutoSyncTime: string | null;
  nextAutoSyncTime: string | null;
  syncHistory: {
    timestamp: string;
    success: boolean;
    counts: { sales: number; purchase: number; expense: number; payment: number };
    message: string;
    elapsedMs: number;
  }[];
}

export interface SchemaValidationDiagnostic {
  isValid: boolean;
  totalChecked: number;
  validCount: number;
  invalidCount: number;
  collection: string;
  errors: {
    index: number;
    recordSummary: string;
    missingFields: string[];
    typeErrors: string[];
    details: string;
  }[];
  timestamp: string;
}

export interface KeepAliveConfig {
  enabled: boolean;
  intervalMinutes: number;
  targetUrl: string;
  pingsSent: number;
  lastPingTime: string | null;
  lastPingStatus: 'ok' | 'error' | 'idle';
  lastPingLatencyMs: number;
}
