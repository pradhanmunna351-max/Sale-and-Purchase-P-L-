import express from 'express';
import path from 'path';
import Papa from 'papaparse';
import { createServer as createViteServer } from 'vite';
import { INITIAL_EXPENSES, INITIAL_SALES, INITIAL_PURCHASE } from './src/data/mockData.js';
import { ExpenseEntry, SalesRecord, PurchaseRecord } from './src/types.js';

let expenseLedger: ExpenseEntry[] = [];
let salesData: SalesRecord[] = [];
let purchaseData: PurchaseRecord[] = [];
let paymentData: any[] = [];
let sheetUrls = {
  sales: 'https://docs.google.com/spreadsheets/d/1kpjCJHzDRLVhvzd09GGTRvwWSlq-j9QHpU9kBoAbrAU/edit#gid=439511693',
  purchase: 'https://docs.google.com/spreadsheets/d/1kpjCJHzDRLVhvzd09GGTRvwWSlq-j9QHpU9kBoAbrAU/edit#gid=703337859',
  expense: 'https://docs.google.com/spreadsheets/d/1kpjCJHzDRLVhvzd09GGTRvwWSlq-j9QHpU9kBoAbrAU/edit#gid=1491839510',
  payment: 'https://docs.google.com/spreadsheets/d/1kpjCJHzDRLVhvzd09GGTRvwWSlq-j9QHpU9kBoAbrAU/edit#gid=265200234',
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // API Routes
  app.get('/api/config/sheet-urls', (req, res) => {
    res.json(sheetUrls);
  });

  app.get('/api/config/sheet-url', (req, res) => {
    res.json({ sheetUrl: sheetUrls.expense, sheetUrls });
  });

  app.post('/api/config/sheet-urls', async (req, res) => {
    const { sales, purchase, expense, payment } = req.body;
    if (sales !== undefined) sheetUrls.sales = sales;
    if (purchase !== undefined) sheetUrls.purchase = purchase;
    if (expense !== undefined) sheetUrls.expense = expense;
    if (payment !== undefined) sheetUrls.payment = payment;

    try {
      if (sales) await syncGoogleSheetUrl(sales, 'sales').catch((err) => console.warn('Sales sync error:', err));
      if (purchase) await syncGoogleSheetUrl(purchase, 'purchase').catch((err) => console.warn('Purchase sync error:', err));
      if (expense) await syncGoogleSheetUrl(expense, 'expense').catch((err) => console.warn('Expense sync error:', err));
      if (payment) await syncGoogleSheetUrl(payment, 'payment').catch((err) => console.warn('Payment sync error:', err));
    } catch (e) {
      console.warn('Sync failed:', e);
    }

    res.json({ success: true, sheetUrls, counts: { sales: salesData.length, purchase: purchaseData.length, expense: expenseLedger.length, payment: paymentData.length } });
  });

  app.post('/api/sync-all', async (req, res) => {
    try {
      const results = await Promise.allSettled([
        sheetUrls.sales ? syncGoogleSheetUrl(sheetUrls.sales, 'sales') : Promise.resolve(0),
        sheetUrls.purchase ? syncGoogleSheetUrl(sheetUrls.purchase, 'purchase') : Promise.resolve(0),
        sheetUrls.expense ? syncGoogleSheetUrl(sheetUrls.expense, 'expense') : Promise.resolve(0),
        sheetUrls.payment ? syncGoogleSheetUrl(sheetUrls.payment, 'payment') : Promise.resolve(0),
      ]);

      res.json({
        success: true,
        counts: {
          sales: salesData.length,
          purchase: purchaseData.length,
          expense: expenseLedger.length,
          payment: paymentData.length,
        },
        message: 'Successfully synchronized data from Google Sheets!',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Sync failed' });
    }
  });

  app.post('/api/config/sheet-url', (req, res) => {
    const { url } = req.body;
    if (url && typeof url === 'string') {
      sheetUrls.expense = url;
    }
    res.json({ success: true, sheetUrl: sheetUrls.expense, sheetUrls });
  });

  // Link Inspector API: Fetch & extract headers from Google Sheet / CSV URL
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
        if (gidMatch) {
          gid = gidMatch[1];
        }
        csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
      }

      const resp = await fetch(csvUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      });

      if (!resp.ok) {
        return res.status(400).json({
          success: false,
          message: `Unable to fetch Google Sheet (HTTP ${resp.status}). Ensure the Google Sheet is shared with "Anyone with the link can view".`,
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

      // Helper function to auto-detect header matches
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

      // Auto detect category
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

// Helper function to sync and parse live Google Sheet CSV URLs
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

  const records = rawRows.map((row) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, index) => {
      obj[h] = row[index] || '';
    });
    return obj;
  });

  if (category === 'sales') {
    salesData = records.map((r, idx) => mapRecordByColumnMapping(r, {}, 'sales', idx) as SalesRecord);
    return salesData.length;
  } else if (category === 'purchase') {
    purchaseData = records.map((r, idx) => mapRecordByColumnMapping(r, {}, 'purchase', idx) as PurchaseRecord);
    return purchaseData.length;
  } else if (category === 'expense') {
    expenseLedger = records.map((r, idx) => mapRecordByColumnMapping(r, {}, 'expense', idx) as ExpenseEntry);
    return expenseLedger.length;
  } else if (category === 'payment') {
    paymentData = records.map((r, idx) => mapRecordByColumnMapping(r, {}, 'payment', idx));
    return paymentData.length;
  }
  return 0;
}

  // Helper function to map dynamic row objects into target schema
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

  // Import parsed records endpoint
  app.post('/api/import-parsed-data', (req, res) => {
    const { targetType, records, columnMapping, sourceUrl } = req.body;
    if (!targetType || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'Invalid import payload' });
    }

    if (sourceUrl) {
      if (targetType === 'sales') sheetUrls.sales = sourceUrl;
      if (targetType === 'purchase') sheetUrls.purchase = sourceUrl;
      if (targetType === 'expense') sheetUrls.expense = sourceUrl;
      if (targetType === 'payment') sheetUrls.payment = sourceUrl;
    }

    const cachedKeys = records.length > 0 ? Object.keys(records[0]).map(k => ({ original: k, lower: k.toLowerCase().trim() })) : [];

    if (targetType === 'sales') {
      salesData = records.map((r: any, idx: number) =>
        mapRecordByColumnMapping(r, columnMapping || {}, 'sales', idx, cachedKeys) as SalesRecord
      );
      return res.json({
        success: true,
        count: salesData.length,
        message: `Updated Sales dashboard with ${salesData.length} records!`,
      });
    }

    if (targetType === 'purchase') {
      purchaseData = records.map((r: any, idx: number) =>
        mapRecordByColumnMapping(r, columnMapping || {}, 'purchase', idx, cachedKeys) as PurchaseRecord
      );
      return res.json({
        success: true,
        count: purchaseData.length,
        message: `Updated Purchase dashboard with ${purchaseData.length} records!`,
      });
    }

    if (targetType === 'expense') {
      expenseLedger = records.map((r: any, idx: number) =>
        mapRecordByColumnMapping(r, columnMapping || {}, 'expense', idx, cachedKeys) as ExpenseEntry
      );
      return res.json({
        success: true,
        count: expenseLedger.length,
        message: `Updated Expense Ledger with ${expenseLedger.length} entries!`,
      });
    }

    if (targetType === 'payment') {
      paymentData = records.map((r: any, idx: number) =>
        mapRecordByColumnMapping(r, columnMapping || {}, 'payment', idx, cachedKeys)
      );
      return res.json({
        success: true,
        count: paymentData.length,
        message: `Updated Payment Received with ${paymentData.length} entries!`,
      });
    }

    res.status(400).json({ success: false, message: 'Invalid target category' });
  });

  // Expense API
  app.get('/api/expenses', (req, res) => {
    res.json(expenseLedger);
  });

  app.post('/api/expenses', (req, res) => {
    const entry = req.body;
    if (!entry.marketplace || !entry.month || !entry.desc) {
      return res.status(400).json({ success: false, message: 'Marketplace, Month and Expense Type are required' });
    }
    const invoice = parseFloat(entry.invoice) || 0;
    const credit = parseFloat(entry.credit) || 0;
    const netValue = invoice - credit;

    const newIndex = expenseLedger.length > 0 ? Math.max(...expenseLedger.map(e => e.rowIndex)) + 1 : 2;

    const newEntry: ExpenseEntry = {
      rowIndex: newIndex,
      marketplace: String(entry.marketplace).trim(),
      month: String(entry.month).trim(),
      invoiceNumber: String(entry.invoiceNumber || '').trim(),
      name: String(entry.name || '').trim(),
      desc: String(entry.desc).trim(),
      invoice,
      credit,
      netValue
    };

    expenseLedger.push(newEntry);
    res.json({ success: true, message: 'Entry added successfully', entry: newEntry });
  });

  app.delete('/api/expenses/:rowIndex', (req, res) => {
    const rowIndex = parseInt(req.params.rowIndex, 10);
    const initialLength = expenseLedger.length;
    expenseLedger = expenseLedger.filter(e => e.rowIndex !== rowIndex);

    if (expenseLedger.length < initialLength) {
      res.json({ success: true, message: 'Entry deleted successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Entry not found' });
    }
  });

  app.post('/api/expenses/bulk', (req, res) => {
    const { data } = req.body; // array of rows
    if (!Array.isArray(data)) {
      return res.status(400).json({ success: false, message: 'Invalid data format' });
    }

    let addedCount = 0;
    const errorRows: number[] = [];

    data.forEach((row: any, i: number) => {
      if (!row || (!row[0] && !row[1] && !row[4])) return;

      const marketplace = String(row[0] || '').trim();
      const month = String(row[1] || '').trim();
      const invoiceNumber = String(row[2] || '').trim();
      const name = String(row[3] || '').trim();
      const desc = String(row[4] || '').trim();

      if (!marketplace || !month || !desc) {
        errorRows.push(i + 1);
        return;
      }

      const invoice = parseFloat(row[5]) || 0;
      const credit = parseFloat(row[6]) || 0;
      let net = invoice - credit;

      if (row[7] !== undefined && row[7] !== '' && !isNaN(parseFloat(row[7]))) {
        net = parseFloat(row[7]);
      }

      const newIndex = expenseLedger.length > 0 ? Math.max(...expenseLedger.map(e => e.rowIndex)) + 1 : 2;

      expenseLedger.push({
        rowIndex: newIndex,
        marketplace,
        month,
        invoiceNumber,
        name,
        desc,
        invoice,
        credit,
        netValue: net
      });

      addedCount++;
    });

    res.json({
      success: true,
      added: addedCount,
      errors: errorRows,
      message: `${addedCount} entries added successfully${errorRows.length > 0 ? `. ${errorRows.length} rows skipped (invalid data).` : ''}`
    });
  });

  app.post('/api/expenses/clear', (req, res) => {
    expenseLedger = [];
    res.json({ success: true, message: 'All entries cleared' });
  });

  app.post('/api/expenses/reset', (req, res) => {
    expenseLedger = [...INITIAL_EXPENSES];
    res.json({ success: true, message: 'Sheet reset successfully' });
  });

// Sales API
  app.get('/api/sales', (req, res) => {
    res.json(salesData);
  });

  app.get('/api/payments', (req, res) => {
    res.json(paymentData);
  });

  app.post('/api/sales', (req, res) => {
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
    salesData.push(newRecord);
    res.json({ success: true, message: 'Sales record added', record: newRecord });
  });

  app.post('/api/sales/bulk', (req, res) => {
    const { data } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ success: false, message: 'Invalid data format' });
    }
    let addedCount = 0;
    data.forEach((row: any) => {
      if (!row || (!row[0] && !row[1] && !row[4])) return;
      // CSV headers: Month, Channel, Date, Account_Name, Transaction_Details, Transaction_Type, Reference_Number, Entity_Number, Debit, Credit, Net_Amount, Status, Final Status, Return Type
      const month = String(row[0] || '').trim();
      const channel = String(row[1] || '').trim();
      if (!month || !channel) return;

      salesData.push({
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
      addedCount++;
    });

    res.json({ success: true, added: addedCount, message: `${addedCount} sales records uploaded successfully` });
  });

  app.post('/api/sales/clear', (req, res) => {
    salesData = [];
    res.json({ success: true, message: 'Sales data cleared' });
  });

  app.post('/api/sales/reset', (req, res) => {
    salesData = [...INITIAL_SALES];
    res.json({ success: true, message: 'Sales data reset to default' });
  });

  // Purchase API
  app.get('/api/purchase', (req, res) => {
    res.json(purchaseData);
  });

  app.post('/api/purchase', (req, res) => {
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
    purchaseData.push(newRecord);
    res.json({ success: true, message: 'Purchase record added', record: newRecord });
  });

  app.post('/api/purchase/bulk', (req, res) => {
    const { data } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ success: false, message: 'Invalid data format' });
    }
    let addedCount = 0;
    data.forEach((row: any) => {
      if (!row || (!row[0] && !row[1] && !row[4])) return;
      const month = String(row[0] || '').trim();
      const channel = String(row[1] || '').trim();
      if (!month || !channel) return;

      purchaseData.push({
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
      addedCount++;
    });

    res.json({ success: true, added: addedCount, message: `${addedCount} purchase records uploaded successfully` });
  });

  app.post('/api/purchase/clear', (req, res) => {
    purchaseData = [];
    res.json({ success: true, message: 'Purchase data cleared' });
  });

  app.post('/api/purchase/reset', (req, res) => {
    purchaseData = [...INITIAL_PURCHASE];
    res.json({ success: true, message: 'Purchase data reset to default' });
  });

  // Brand Names by Channel
  app.get('/api/brands/:channel', (req, res) => {
    const channelLower = String(req.params.channel).toLowerCase();
    const brandsSet = new Set<string>();

    salesData.forEach(item => {
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

  // Vite Integration
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
    console.log(`Expense Ledger Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
