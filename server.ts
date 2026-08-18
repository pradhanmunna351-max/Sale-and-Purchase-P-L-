import express from 'express';
import path from 'path';
import Papa from 'papaparse';
import { createServer as createViteServer } from 'vite';
import { mongoService, BATCH_CONFIG } from './src/server/db.js';
import { syncManager } from './src/server/cronService.js';
import { ExpenseEntry, SalesRecord, PurchaseRecord, PaymentRecord, SchemaValidationDiagnostic } from './src/types.js';
import { validateAndDiagnoseSchema } from './src/server/schemaMapper.js';

function parseNumeric(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[^0-9.-]/g, '').trim();
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

const MONTH_NAMES_ARR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL_NAMES_ARR = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function standardizeMonth(val: any): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  if (!str) return '';

  const clean = str.replace(/[,_]/g, ' ').replace(/\s+/g, ' ').trim();

  const monthMatch = clean.match(/(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)/i);

  if (monthMatch) {
    const mTerm = monthMatch[1].toLowerCase();
    let mIdx = MONTH_NAMES_ARR.findIndex((m) => m.toLowerCase() === mTerm);
    if (mIdx === -1) {
      mIdx = MONTH_FULL_NAMES_ARR.findIndex((m) => m === mTerm);
    }

    if (mIdx !== -1) {
      const monthStr = MONTH_NAMES_ARR[mIdx];
      const yearMatch = clean.match(/\b(20\d{2}|\d{2})\b/);
      if (yearMatch) {
        let yr = parseInt(yearMatch[1], 10);
        if (yr < 100) yr += 2000;
        return `${monthStr} ${yr}`;
      } else {
        return monthStr;
      }
    }
  }

  const numMatch = clean.match(/^(\d{1,4})[-/](\d{1,4})$/);
  if (numMatch) {
    const part1 = parseInt(numMatch[1], 10);
    const part2 = parseInt(numMatch[2], 10);
    let mIdx = -1;
    let year = 0;

    if (part1 > 1000) {
      year = part1;
      if (part2 >= 1 && part2 <= 12) mIdx = part2 - 1;
    } else if (part2 > 1000) {
      year = part2;
      if (part1 >= 1 && part1 <= 12) mIdx = part1 - 1;
    } else if (part2 <= 99) {
      if (part1 >= 1 && part1 <= 12) {
        mIdx = part1 - 1;
        year = 2000 + part2;
      } else if (part2 >= 1 && part2 <= 12) {
        mIdx = part2 - 1;
        year = 2000 + part1;
      }
    }

    if (mIdx >= 0 && mIdx < 12 && year >= 2000) {
      return `${MONTH_NAMES_ARR[mIdx]} ${year}`;
    }
  }

  const parsedDate = new Date(str);
  if (!isNaN(parsedDate.getTime())) {
    const mIdx = parsedDate.getUTCMonth();
    const yr = parsedDate.getUTCFullYear();
    if (yr >= 2000 && yr <= 2100) {
      return `${MONTH_NAMES_ARR[mIdx]} ${yr}`;
    }
  }

  return clean;
}

// Helper function to map dynamic row objects into target MongoDB schema
function mapRecordByColumnMapping(
  rowObj: Record<string, any>,
  mapping: Record<string, string>,
  targetType: 'sales' | 'purchase' | 'expense' | 'payment',
  rowIndex: number,
  cachedKeys?: { original: string; lower: string }[]
) {
  const keysToSearch = cachedKeys || Object.keys(rowObj).map(k => ({ original: k, lower: k.toLowerCase().trim() }));

  const getVal = (key: string, altKeys: string[]) => {
    if (mapping && mapping[key] && rowObj[mapping[key]] !== undefined) {
      return rowObj[mapping[key]];
    }
    for (const alt of altKeys) {
      if (rowObj[alt] !== undefined) return rowObj[alt];
      const altLower = alt.toLowerCase().trim();
      const foundKey = keysToSearch.find((k) => k.lower === altLower || k.lower.includes(altLower));
      if (foundKey && rowObj[foundKey.original] !== undefined) return rowObj[foundKey.original];
    }
    return '';
  };

  if (targetType === 'expense') {
    const inv = parseNumeric(getVal('debit', ['invoice value', 'invoice', 'debit', 'amount']));
    const cred = parseNumeric(getVal('credit', ['credit note value', 'credit note', 'credit', 'return']));
    const netVal = inv - cred;

    return {
      rowIndex: rowIndex + 2,
      marketplace: String(getVal('channel', ['marketplace', 'channel', 'platform', 'store']) || 'Direct').trim(),
      month: standardizeMonth(getVal('month', ['month', 'date', 'period'])),
      invoiceNumber: String(getVal('referenceNumber', ['invoice number', 'reference_number', 'ref']) || '').trim(),
      name: String(getVal('name', ['seller / brand name', 'account_name', 'seller', 'brand', 'name']) || '').trim(),
      desc: String(getVal('desc', ['expense type', 'transaction_details', 'description', 'desc']) || '').trim(),
      invoice: inv,
      credit: cred,
      netValue: netVal,
    };
  }

  if (targetType === 'payment') {
    return {
      Payment_No: String(getVal('paymentNo', ['payment no', 'payment', 'id', 'ref']) || '').trim(),
      Bank_Entry_Date: String(getVal('date', ['bank entry date', 'date', 'bank date']) || new Date().toISOString().split('T')[0]).trim(),
      Description: String(getVal('desc', ['description', 'desc', 'details', 'narration']) || '').trim(),
      Amount: parseNumeric(getVal('amount', ['amount', 'value', 'payment amount'])),
      Channel: String(getVal('channel', ['channel', 'marketplace', 'source']) || 'Direct').trim(),
      Month: standardizeMonth(getVal('month', ['month', 'period', 'date']))
    };
  }

  if (targetType === 'sales') {
    const debit = parseNumeric(getVal('debit', ['debit', 'invoice', 'invoice value', 'gross sales', 'sales', 'amount', 'total']));
    const credit = parseNumeric(getVal('credit', ['credit', 'sales return', 'return', 'credit note', 'credit note value', 'refund', 'discount']));
    const transType = String(getVal('type', ['transaction_type', 'type', 'transaction type', 'voucher type', 'doc type']) || '').trim();
    const rawNet = parseNumeric(getVal('net', ['net_amount', 'net amount', 'net value', 'net sales', 'net']));
    const netAmt = rawNet !== 0 ? rawNet : (credit !== 0 && debit === 0 ? credit : (debit !== 0 && credit === 0 ? debit : Math.abs(debit - credit)));
    const docStatus = String(getVal('status', ['document status', 'document_status', 'status', 'state', 'doc status', 'final status', 'payment status']) || '').trim();
    const finalStatus = String(getVal('finalStatus', ['final status', 'final_status', 'payment status']) || docStatus || 'Completed').trim();

    return {
      Month: standardizeMonth(getVal('month', ['month', 'date', 'period', 'bill date', 'invoice date'])),
      Channel: String(getVal('channel', ['channel', 'marketplace', 'platform', 'store', 'source']) || 'Direct').trim(),
      Date: String(getVal('date', ['date', 'month', 'invoice date', 'bill date']) || new Date().toISOString().split('T')[0]).trim(),
      Account_Name: String(getVal('name', ['account_name', 'customer name', 'customer', 'party name', 'party', 'name', 'seller', 'brand']) || '').trim(),
      Transaction_Details: String(getVal('desc', ['transaction_details', 'desc', 'details', 'item details', 'expense type', 'narration']) || '').trim(),
      Transaction_Type: transType || 'Invoice',
      Reference_Number: String(getVal('referenceNumber', ['reference_number', 'invoice number', 'invoice no', 'inv no', 'ref', 'ref no']) || '').trim(),
      Entity_Number: String(getVal('entity', ['entity_number', 'entity', 'gstin', 'pan', 'id']) || '').trim(),
      Debit: debit,
      Credit: credit,
      Net_Amount: netAmt,
      Status: docStatus || 'Completed',
      'Final Status': finalStatus,
      'Return Type': '',
      Outstanding_Balance: parseNumeric(getVal('outstanding', ['outstanding', 'outstanding balance', 'outstanding_balance', 'balance', 'due amount', 'pending amount'])),
      Document_Status: docStatus,
    };
  }

  if (targetType === 'purchase') {
    const debit = parseNumeric(getVal('debit', ['debit', 'purchase', 'purchase bill', 'bill amount', 'invoice value', 'bill', 'amount', 'gross', 'cogs', 'total']));
    const credit = parseNumeric(getVal('credit', ['credit', 'vendor credit', 'return', 'purchase return', 'credit note', 'debit note', 'discount', 'refund']));
    const transType = String(getVal('type', ['transaction_type', 'type', 'transaction type', 'voucher type', 'doc type']) || '').trim();
    const rawNet = parseNumeric(getVal('net', ['net_amount', 'net amount', 'net value', 'net purchase', 'net']));
    const netAmt = rawNet !== 0 ? rawNet : (debit !== 0 ? debit : (credit !== 0 ? credit : 0));
    const docStatus = String(getVal('status', ['document status', 'document_status', 'status', 'state', 'doc status', 'final status', 'payment status', 'due status']) || '').trim();
    const finalStatus = String(getVal('finalStatus', ['final status', 'final_status', 'payment status']) || docStatus || 'Completed').trim();

    return {
      Month: standardizeMonth(getVal('month', ['month', 'date', 'period', 'bill date', 'invoice date'])),
      Channel: String(getVal('channel', ['channel', 'supplier', 'vendor', 'category', 'marketplace', 'source']) || 'Supplier').trim(),
      Date: String(getVal('date', ['date', 'month', 'bill date', 'invoice date']) || new Date().toISOString().split('T')[0]).trim(),
      Account_Name: String(getVal('name', ['account_name', 'supplier name', 'vendor name', 'supplier', 'vendor', 'party name', 'party', 'name']) || '').trim(),
      Transaction_Details: String(getVal('desc', ['transaction_details', 'desc', 'details', 'item details', 'expense type', 'narration']) || '').trim(),
      Transaction_Type: transType || 'Bill',
      Reference_Number: String(getVal('referenceNumber', ['reference_number', 'bill no', 'bill number', 'invoice number', 'ref', 'ref no', 'voucher no']) || '').trim(),
      Entity_Number: String(getVal('entity', ['entity_number', 'entity', 'gstin', 'pan', 'id']) || '').trim(),
      Debit: debit,
      Credit: credit,
      Net_Amount: netAmt,
      Status: docStatus || 'Completed',
      'Final Status': finalStatus,
      'Return Type': '',
      Outstanding_Balance: parseNumeric(getVal('outstanding', ['outstanding', 'outstanding balance', 'outstanding_balance', 'balance', 'due amount', 'pending amount'])),
      Document_Status: docStatus,
    };
  }
}

// Fetch & Chunk Ingest Google Sheet CSV
async function syncGoogleSheetUrl(url: string, category: 'sales' | 'purchase' | 'expense' | 'payment'): Promise<number> {
  if (!url || typeof url !== 'string' || !url.trim()) return 0;

  let csvUrl = url.trim();
  const match = csvUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    const sheetId = match[1];
    let gid = '0';
    const gidMatch = csvUrl.match(/gid=([0-9]+)/);
    if (gidMatch) gid = gidMatch[1];
    csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  }

  const resp = await fetch(csvUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch sheet HTTP ${resp.status}`);
  }

  const csvText = await resp.text();
  const parsed = Papa.parse(csvText, { skipEmptyLines: true });
  if (!parsed.data || parsed.data.length < 2) return 0;

  const headers = (parsed.data[0] as string[]).map((h) => String(h || '').trim());
  const rawRows = (parsed.data.slice(1) as string[][]).filter((row) =>
    row.some((cell) => cell && String(cell).trim() !== '')
  );

  const rawRecords = rawRows.map((row) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, index) => {
      obj[h] = row[index] || '';
    });
    return obj;
  });

  const collectionMap: Record<string, 'sales' | 'purchases' | 'expenses' | 'payments'> = {
    sales: 'sales',
    purchase: 'purchases',
    expense: 'expenses',
    payment: 'payments',
  };

  const mappedRecords = rawRecords.map((r, idx) => mapRecordByColumnMapping(r, {}, category, idx));
  const targetColl = collectionMap[category];

  const result = await mongoService.chunkedBatchInsert(targetColl, mappedRecords, {
    chunkSize: BATCH_CONFIG.DEFAULT_CHUNK_SIZE,
    replaceAll: true,
    concurrency: BATCH_CONFIG.MAX_CONCURRENCY,
  });

  return result.totalRecords;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize MongoDB on server boot
  await mongoService.init();

  // -------------------------------------------------------------
  // MONGODB STATUS & MANAGEMENT APIS
  // -------------------------------------------------------------
  app.get('/api/mongodb/status', async (req, res) => {
    try {
      const status = await mongoService.getStatus();
      res.json({ success: true, status });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Status query failed' });
    }
  });

  app.post('/api/mongodb/config', async (req, res) => {
    const { uri, password } = req.body;
    let targetUri = uri;

    if (password && typeof password === 'string') {
      const baseUri = uri || process.env.MONGODB_URI || 'mongodb+srv://munapradhan:<db_password>@cluster0.dwrw0lm.mongodb.net/?appName=Cluster0';
      targetUri = baseUri.replace('<db_password>', encodeURIComponent(password.trim())).replace('<password>', encodeURIComponent(password.trim()));
    }

    if (!targetUri || typeof targetUri !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid MongoDB URI or password is required' });
    }

    const connected = await mongoService.init(targetUri);
    const status = await mongoService.getStatus();

    if (connected) {
      res.json({ success: true, message: 'Connected to MongoDB Atlas successfully!', status });
    } else {
      res.status(400).json({ success: false, message: status.errorMessage || 'Could not connect to MongoDB', status });
    }
  });

  app.get('/api/parallel-summary', async (req, res) => {
    try {
      const benchmark = await mongoService.getParallelDashboardMetrics();
      res.json({ success: true, benchmark });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Parallel query failed' });
    }
  });

  app.post('/api/mongodb/reset', async (req, res) => {
    try {
      await mongoService.resetToDefaults();
      res.json({ success: true, message: 'MongoDB collections reset and seeded with default ledger records.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Reset failed' });
    }
  });

  // -------------------------------------------------------------
  // SCHEMA VALIDATION DIAGNOSTIC UTILITY ENDPOINT
  // -------------------------------------------------------------
  app.post('/api/mongodb/diagnostics/validate-schema', async (req, res) => {
    try {
      const { collection, records } = req.body;
      if (!collection) {
        return res.status(400).json({ success: false, message: 'Collection name is required ("sales", "purchases", "expenses", "payments")' });
      }

      let dataToTest = records;
      if (!dataToTest) {
        if (collection === 'sales') dataToTest = await mongoService.getSales();
        else if (collection === 'purchases' || collection === 'purchase') dataToTest = await mongoService.getPurchases();
        else if (collection === 'expenses' || collection === 'expense') dataToTest = await mongoService.getExpenses();
        else if (collection === 'payments' || collection === 'payment') dataToTest = await mongoService.getPayments();
        else dataToTest = [];
      }

      const diagnostics = validateAndDiagnoseSchema(collection, dataToTest || []);
      const status = await mongoService.getStatus();

      res.json({
        success: true,
        collection,
        diagnostics,
        mongoConnection: {
          connected: status.connected,
          state: status.state,
          databaseName: status.databaseName,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Diagnostic schema validation failed' });
    }
  });

  // -------------------------------------------------------------
  // HIGH-PERFORMANCE CHUNKED BATCH SHEET UPLOADER WITH LOAD BALANCER
  // -------------------------------------------------------------
  app.post('/api/import-chunked', async (req, res) => {
    try {
      const { targetType, records, columnMapping, chunkSize, concurrency, replaceAll, sourceUrl } = req.body;

      if (!targetType || !Array.isArray(records)) {
        return res.status(400).json({ success: false, message: 'Invalid payload: targetType and records array required' });
      }

      if (sourceUrl) {
        const currentUrls = (await mongoService.getConfig('sheetUrls')) || {};
        currentUrls[targetType] = sourceUrl;
        await mongoService.setConfig('sheetUrls', currentUrls);
      }

      const cachedKeys = records.length > 0 ? Object.keys(records[0]).map(k => ({ original: k, lower: k.toLowerCase().trim() })) : [];

      const mappedRecords = records.map((r: any, idx: number) =>
        mapRecordByColumnMapping(r, columnMapping || {}, targetType, idx, cachedKeys)
      );

      const collectionMap: Record<string, 'sales' | 'purchases' | 'expenses' | 'payments'> = {
        sales: 'sales',
        purchase: 'purchases',
        expense: 'expenses',
        payment: 'payments',
      };

      const targetColl = collectionMap[targetType];
      if (!targetColl) {
        return res.status(400).json({ success: false, message: `Unknown category "${targetType}"` });
      }

      const result = await mongoService.chunkedBatchInsert(targetColl, mappedRecords, {
        chunkSize: chunkSize || BATCH_CONFIG.DEFAULT_CHUNK_SIZE,
        concurrency: concurrency || BATCH_CONFIG.MAX_CONCURRENCY,
        replaceAll: replaceAll !== undefined ? replaceAll : true,
      });

      res.json({
        success: true,
        category: targetType,
        ...result,
      });
    } catch (err: any) {
      console.error('Chunked import error:', err);
      res.status(500).json({ success: false, message: err.message || 'Chunked import failed' });
    }
  });

  // -------------------------------------------------------------
  // GOOGLE SHEET CONFIGURATION & URLS
  // -------------------------------------------------------------
  app.get('/api/config/sheet-urls', async (req, res) => {
    const urls = await mongoService.getConfig('sheetUrls');
    res.json(urls || {
      sales: 'https://docs.google.com/spreadsheets/d/1kpjCJHzDRLVhvzd09GGTRvwWSlq-j9QHpU9kBoAbrAU/edit#gid=439511693',
      purchase: 'https://docs.google.com/spreadsheets/d/1kpjCJHzDRLVhvzd09GGTRvwWSlq-j9QHpU9kBoAbrAU/edit#gid=703337859',
      expense: 'https://docs.google.com/spreadsheets/d/1kpjCJHzDRLVhvzd09GGTRvwWSlq-j9QHpU9kBoAbrAU/edit#gid=1491839510',
      payment: 'https://docs.google.com/spreadsheets/d/1kpjCJHzDRLVhvzd09GGTRvwWSlq-j9QHpU9kBoAbrAU/edit#gid=265200234',
    });
  });

  app.post('/api/config/sheet-urls', async (req, res) => {
    const { sales, purchase, expense, payment } = req.body;
    const currentUrls = (await mongoService.getConfig('sheetUrls')) || {};

    if (sales !== undefined) currentUrls.sales = sales;
    if (purchase !== undefined) currentUrls.purchase = purchase;
    if (expense !== undefined) currentUrls.expense = expense;
    if (payment !== undefined) currentUrls.payment = payment;

    await mongoService.setConfig('sheetUrls', currentUrls);

    // Parallel sync across all 4 sheet streams
    try {
      await Promise.allSettled([
        sales ? syncGoogleSheetUrl(sales, 'sales') : Promise.resolve(0),
        purchase ? syncGoogleSheetUrl(purchase, 'purchase') : Promise.resolve(0),
        expense ? syncGoogleSheetUrl(expense, 'expense') : Promise.resolve(0),
        payment ? syncGoogleSheetUrl(payment, 'payment') : Promise.resolve(0),
      ]);
    } catch (e) {
      console.warn('Sync warning:', e);
    }

    const status = await mongoService.getStatus();
    res.json({
      success: true,
      sheetUrls: currentUrls,
      counts: {
        sales: status.collections.sales.count,
        purchase: status.collections.purchases.count,
        expense: status.collections.expenses.count,
        payment: status.collections.payments.count,
      },
    });
  });

  // -------------------------------------------------------------
  // RENDER HEALTH & 24/7 KEEP-ALIVE ENDPOINTS
  // -------------------------------------------------------------
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'Business Ledger MongoDB Engine',
    });
  });

  app.get('/api/cron/status', (req, res) => {
    res.json({
      success: true,
      autoSync: syncManager.autoSyncConfig,
      keepAlive: syncManager.keepAliveConfig,
    });
  });

  app.post('/api/cron/auto-sync/config', async (req, res) => {
    const { enabled, intervalMinutes } = req.body;
    if (enabled !== undefined) syncManager.autoSyncConfig.enabled = !!enabled;
    if (intervalMinutes !== undefined) syncManager.autoSyncConfig.intervalMinutes = Math.max(1, parseInt(intervalMinutes, 10));

    if (syncManager.autoSyncConfig.enabled) {
      syncManager.startAutoSyncCron(syncManager.autoSyncConfig.intervalMinutes);
    } else {
      syncManager.stopAutoSyncCron();
    }

    await mongoService.setConfig('autoSyncConfig', syncManager.autoSyncConfig);
    res.json({ success: true, autoSync: syncManager.autoSyncConfig });
  });

  app.post('/api/cron/auto-sync/trigger', async (req, res) => {
    try {
      const result = await syncManager.runAutoSync();
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Auto sync trigger failed' });
    }
  });

  app.post('/api/cron/keep-alive/config', async (req, res) => {
    const { enabled, intervalMinutes, targetUrl } = req.body;
    if (enabled !== undefined) syncManager.keepAliveConfig.enabled = !!enabled;
    if (targetUrl) syncManager.keepAliveConfig.targetUrl = targetUrl;
    if (intervalMinutes !== undefined) syncManager.keepAliveConfig.intervalMinutes = Math.max(1, parseInt(intervalMinutes, 10));

    if (syncManager.keepAliveConfig.enabled) {
      syncManager.startKeepAliveCron(syncManager.keepAliveConfig.targetUrl, syncManager.keepAliveConfig.intervalMinutes);
    } else {
      syncManager.stopKeepAliveCron();
    }

    await mongoService.setConfig('keepAliveConfig', syncManager.keepAliveConfig);
    res.json({ success: true, keepAlive: syncManager.keepAliveConfig });
  });

  app.post('/api/cron/keep-alive/ping-now', async (req, res) => {
    const ok = await syncManager.pingKeepAlive();
    res.json({ success: ok, keepAlive: syncManager.keepAliveConfig });
  });

  // -------------------------------------------------------------
  // DIRECT SEED / UPLOAD RAW CSV DATA DIRECTLY INTO DATABASE
  // -------------------------------------------------------------
  app.post('/api/direct-seed-file', async (req, res) => {
    try {
      const { category, csvContent, records, replaceExisting = true } = req.body;

      if (!category || (!csvContent && (!records || !Array.isArray(records)))) {
        return res.status(400).json({
          success: false,
          message: 'Target category ("sales", "purchase", "expense", "payment") and data (csvContent or records) are required',
        });
      }

      let parsedRecords: any[] = [];

      if (Array.isArray(records) && records.length > 0) {
        parsedRecords = records;
      } else if (csvContent && typeof csvContent === 'string') {
        const parsed = Papa.parse(csvContent.trim(), { header: true, skipEmptyLines: true });
        parsedRecords = parsed.data as any[];
      }

      if (parsedRecords.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid data rows found to seed' });
      }

      const cachedKeys = Object.keys(parsedRecords[0]).map(k => ({ original: k, lower: k.toLowerCase().trim() }));
      const mappedRecords = parsedRecords.map((r, idx) =>
        mapRecordByColumnMapping(r, {}, category as any, idx, cachedKeys)
      );

      const collectionMap: Record<string, 'sales' | 'purchases' | 'expenses' | 'payments'> = {
        sales: 'sales',
        purchase: 'purchases',
        expense: 'expenses',
        payment: 'payments',
      };

      const targetColl = collectionMap[category];
      if (!targetColl) {
        return res.status(400).json({ success: false, message: `Invalid category ${category}` });
      }

      const result = await mongoService.chunkedBatchInsert(targetColl, mappedRecords, {
        chunkSize: 500,
        concurrency: 4,
        replaceAll: !!replaceExisting,
      });

      res.json({
        success: true,
        message: `Directly seeded ${result.totalRecords} records into MongoDB collection "${targetColl}"`,
        ...result,
      });
    } catch (err: any) {
      console.error('Direct seed error:', err);
      res.status(500).json({ success: false, message: err.message || 'Direct seed upload failed' });
    }
  });

  // -------------------------------------------------------------
  // LINK INSPECTOR API
  // -------------------------------------------------------------
  app.post('/api/inspect-link', async (req, res) => {
    try {
      const { url, targetType } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ success: false, message: 'Google Sheet or CSV URL is required' });
      }

      let csvUrl = url.trim();
      const match = csvUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match) {
        const sheetId = match[1];
        let gid = '0';
        const gidMatch = csvUrl.match(/gid=([0-9]+)/);
        if (gidMatch) gid = gidMatch[1];
        csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
      }

      const resp = await fetch(csvUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });

      if (!resp.ok) {
        return res.status(400).json({
          success: false,
          message: `Unable to fetch Google Sheet (HTTP ${resp.status}). Ensure the sheet is shared with "Anyone with the link can view".`,
        });
      }

      const csvText = await resp.text();
      const parsed = Papa.parse(csvText, { skipEmptyLines: true });

      if (!parsed.data || parsed.data.length === 0) {
        return res.status(400).json({ success: false, message: 'No data rows found in sheet' });
      }

      const headers = (parsed.data[0] as string[]).map((h) => String(h || '').trim());
      const rawRows = (parsed.data.slice(1) as string[][]).filter((row) =>
        row.some((cell) => cell && String(cell).trim() !== '')
      );

      const findHeaderMatch = (keywords: string[]) => {
        for (const kw of keywords) {
          const matched = headers.find((h) => h.toLowerCase().trim().includes(kw.toLowerCase()));
          if (matched) return matched;
        }
        return '';
      };

      const suggestedMapping = {
        month: findHeaderMatch(['month', 'date', 'period']),
        channel: findHeaderMatch(['channel', 'marketplace', 'platform', 'store', 'vendor', 'supplier']),
        debit: findHeaderMatch(['invoice value', 'debit', 'invoice', 'purchase', 'amount', 'bill']),
        credit: findHeaderMatch(['credit note value', 'credit note', 'credit', 'return', 'refund']),
        name: findHeaderMatch(['seller / brand name', 'account_name', 'account name', 'seller', 'brand', 'supplier', 'name', 'vendor']),
        desc: findHeaderMatch(['expense type', 'transaction_details', 'description', 'details', 'desc']),
        referenceNumber: findHeaderMatch(['invoice number', 'reference_number', 'reference number', 'ref', 'bill number']),
      };

      let detectedCategory: 'sales' | 'purchase' | 'expense' = targetType || 'sales';
      const headerStr = headers.join(' ').toLowerCase();
      if (
        headerStr.includes('marketplace') ||
        headerStr.includes('expense type') ||
        headerStr.includes('credit note value') ||
        headerStr.includes('vfh charges')
      ) {
        detectedCategory = 'expense';
      } else if (
        headerStr.includes('bill') ||
        headerStr.includes('vendor') ||
        headerStr.includes('supplier') ||
        headerStr.includes('purchase')
      ) {
        detectedCategory = 'purchase';
      } else if (
        headerStr.includes('channel') ||
        headerStr.includes('debit') ||
        headerStr.includes('credit')
      ) {
        detectedCategory = 'sales';
      }

      res.json({
        success: true,
        originalUrl: url,
        csvUrl,
        headers,
        totalRows: rawRows.length,
        detectedCategory,
        suggestedMapping,
        sampleRows: rawRows.slice(0, 3),
        rawRows,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        message: `Error inspecting sheet link: ${err.message || 'Unknown network error'}`,
      });
    }
  });

  // -------------------------------------------------------------
  // SALES, PURCHASE, EXPENSE, PAYMENT CRUD APIS (MONGODB POWERED)
  // -------------------------------------------------------------
  app.get('/api/sales', async (req, res) => {
    try {
      const records = await mongoService.getSales();
      res.json(records);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/sales', async (req, res) => {
    const item = req.body;
    if (!item.Month || !item.Channel) {
      return res.status(400).json({ success: false, message: 'Month and Channel are required' });
    }
    const newRecord: SalesRecord = {
      Month: String(item.Month).trim(),
      Channel: String(item.Channel).trim(),
      Date: item.Date || new Date().toISOString().split('T')[0],
      Account_Name: item.Account_Name || '',
      Transaction_Details: item.Transaction_Details || '',
      Transaction_Type: item.Transaction_Type || 'Invoice',
      Reference_Number: item.Reference_Number || '',
      Entity_Number: item.Entity_Number || '',
      Debit: parseFloat(item.Debit) || 0,
      Credit: parseFloat(item.Credit) || 0,
      Net_Amount: parseFloat(item.Net_Amount) || (parseFloat(item.Credit) - parseFloat(item.Debit)) || 0,
      Status: item.Status || 'Completed',
      'Final Status': item['Final Status'] || 'Paid',
      'Return Type': item['Return Type'] || '',
    };
    const insertResult = await mongoService.chunkedBatchInsert('sales', [newRecord], { replaceAll: false });
    res.json({
      success: insertResult.success,
      message: insertResult.message,
      record: newRecord,
      verifiedCollectionCount: insertResult.verifiedCollectionCount,
      diagnostics: insertResult.diagnostics,
    });
  });

  app.post('/api/sales/clear', async (req, res) => {
    await mongoService.clearCollection('sales');
    res.json({ success: true, message: 'Sales collection cleared' });
  });

  app.get('/api/purchase', async (req, res) => {
    try {
      const records = await mongoService.getPurchases();
      res.json(records);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/purchase', async (req, res) => {
    const item = req.body;
    if (!item.Month || !item.Channel) {
      return res.status(400).json({ success: false, message: 'Month and Channel are required' });
    }
    const newRecord: PurchaseRecord = {
      Month: String(item.Month).trim(),
      Channel: String(item.Channel).trim(),
      Date: item.Date || new Date().toISOString().split('T')[0],
      Account_Name: item.Account_Name || '',
      Transaction_Details: item.Transaction_Details || '',
      Transaction_Type: item.Transaction_Type || 'Bill',
      Reference_Number: item.Reference_Number || '',
      Entity_Number: item.Entity_Number || '',
      Debit: parseFloat(item.Debit) || 0,
      Credit: parseFloat(item.Credit) || 0,
      Net_Amount: parseFloat(item.Net_Amount) || (parseFloat(item.Debit) - parseFloat(item.Credit)) || 0,
      Status: item.Status || 'Completed',
      'Final Status': item['Final Status'] || 'Paid',
      'Return Type': item['Return Type'] || '',
    };
    const insertResult = await mongoService.chunkedBatchInsert('purchases', [newRecord], { replaceAll: false });
    res.json({
      success: insertResult.success,
      message: insertResult.message,
      record: newRecord,
      verifiedCollectionCount: insertResult.verifiedCollectionCount,
      diagnostics: insertResult.diagnostics,
    });
  });

  app.post('/api/purchase/clear', async (req, res) => {
    await mongoService.clearCollection('purchases');
    res.json({ success: true, message: 'Purchase collection cleared' });
  });

  app.get('/api/expenses', async (req, res) => {
    try {
      const records = await mongoService.getExpenses();
      res.json(records);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/expenses', async (req, res) => {
    const entry = req.body;
    if (!entry.marketplace || !entry.month || !entry.desc) {
      return res.status(400).json({ success: false, message: 'Marketplace, Month and Expense Type are required' });
    }
    const invoice = parseFloat(entry.invoice) || 0;
    const credit = parseFloat(entry.credit) || 0;
    const netValue = invoice - credit;

    const existing = await mongoService.getExpenses();
    const newIndex = existing.length > 0 ? Math.max(...existing.map(e => e.rowIndex)) + 1 : 2;

    const newEntry: ExpenseEntry = {
      rowIndex: newIndex,
      marketplace: String(entry.marketplace).trim(),
      month: String(entry.month).trim(),
      invoiceNumber: String(entry.invoiceNumber || '').trim(),
      name: String(entry.name || '').trim(),
      desc: String(entry.desc).trim(),
      invoice,
      credit,
      netValue,
    };

    await mongoService.addExpense(newEntry);
    res.json({ success: true, message: 'Entry saved to MongoDB', entry: newEntry });
  });

  app.delete('/api/expenses/:rowIndex', async (req, res) => {
    const rowIndex = parseInt(req.params.rowIndex, 10);
    const deleted = await mongoService.deleteExpense(rowIndex);
    if (deleted) {
      res.json({ success: true, message: 'Entry deleted from MongoDB' });
    } else {
      res.status(404).json({ success: false, message: 'Entry not found' });
    }
  });

  app.post('/api/expenses/clear', async (req, res) => {
    await mongoService.clearCollection('expenses');
    res.json({ success: true, message: 'Expense collection cleared' });
  });

  app.get('/api/payments', async (req, res) => {
    try {
      const records = await mongoService.getPayments();
      res.json(records);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Backward compatibility alias for import-parsed-data
  app.post('/api/import-parsed-data', async (req, res) => {
    try {
      const { targetType, records, columnMapping, sourceUrl } = req.body;
      if (!targetType || !Array.isArray(records)) {
        return res.status(400).json({ success: false, message: 'Invalid import payload' });
      }

      if (sourceUrl) {
        const currentUrls = (await mongoService.getConfig('sheetUrls')) || {};
        currentUrls[targetType] = sourceUrl;
        await mongoService.setConfig('sheetUrls', currentUrls);
      }

      const cachedKeys = records.length > 0 ? Object.keys(records[0]).map(k => ({ original: k, lower: k.toLowerCase().trim() })) : [];
      const mappedRecords = records.map((r: any, idx: number) =>
        mapRecordByColumnMapping(r, columnMapping || {}, targetType, idx, cachedKeys)
      );

      const collectionMap: Record<string, 'sales' | 'purchases' | 'expenses' | 'payments'> = {
        sales: 'sales',
        purchase: 'purchases',
        expense: 'expenses',
        payment: 'payments',
      };

      const targetColl = collectionMap[targetType];
      const result = await mongoService.chunkedBatchInsert(targetColl, mappedRecords, {
        chunkSize: BATCH_CONFIG.DEFAULT_CHUNK_SIZE,
        concurrency: BATCH_CONFIG.MAX_CONCURRENCY,
        replaceAll: true,
      });

      res.json({
        success: true,
        count: result.totalRecords,
        throughput: result.throughputPerSec,
        message: `Updated ${targetType.toUpperCase()} with ${result.totalRecords} records across ${result.totalChunks} parallel chunks (${result.throughputPerSec} recs/sec)`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Import failed' });
    }
  });

  // Brand Names Filter endpoint
  app.get('/api/brands/:channel', async (req, res) => {
    const channelLower = String(req.params.channel).toLowerCase();
    const brandsSet = new Set<string>();
    const sales = await mongoService.getSales();

    sales.forEach(item => {
      const rowChannel = String(item.Channel || '').trim().toLowerCase();
      let match = rowChannel === channelLower;
      if (!rowChannel && item.Account_Name) {
        const accName = item.Account_Name.toLowerCase();
        if (accName.includes(channelLower)) match = true;
      }
      if (match && item.Transaction_Details) {
        brandsSet.add(item.Transaction_Details);
      }
    });

    res.json(Array.from(brandsSet).sort());
  });

  // Vite Frontend Middleware Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 MongoDB-Powered Ledger Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
