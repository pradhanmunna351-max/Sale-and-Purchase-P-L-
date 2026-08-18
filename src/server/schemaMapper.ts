// Utility to normalize month strings into "MMM YYYY" (e.g. "Jan 2026")
const MONTH_NAMES_ARR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseNumeric(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const clean = String(val).replace(/[^0-9.-]/g, '').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

export function standardizeMonth(val: any): string {
  if (!val) return 'Jan 2026';
  const str = String(val).trim();
  const clean = str.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();

  for (let i = 0; i < MONTH_NAMES_ARR.length; i++) {
    const m = MONTH_NAMES_ARR[i];
    const regex = new RegExp(`\\b${m}\\w*\\b`, 'i');
    if (regex.test(clean)) {
      const yrMatch = clean.match(/\b(20\d{2}|\d{2})\b/);
      let year = '2026';
      if (yrMatch) {
        year = yrMatch[1].length === 2 ? `20${yrMatch[1]}` : yrMatch[1];
      }
      return `${m} ${year}`;
    }
  }

  const slashMatch = clean.match(/^(\d{1,4})[/-](\d{1,4})(?:[/-](\d{2,4}))?$/);
  if (slashMatch) {
    const part1 = parseInt(slashMatch[1], 10);
    const part2 = parseInt(slashMatch[2], 10);
    let year = 2026;
    let mIdx = 0;

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

// Maps incoming raw sheet / CSV row objects into proper MongoDB typed entities
export function mapRecordByColumnMapping(
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
    const inv = parseNumeric(getVal('debit', ['invoice value', 'invoice', 'debit', 'amount', 'fee', 'expense']));
    const cred = parseNumeric(getVal('credit', ['credit note value', 'credit note', 'credit', 'return', 'refund']));
    const netVal = inv - cred;

    return {
      rowIndex: rowIndex + 2,
      marketplace: String(getVal('channel', ['marketplace', 'channel', 'platform', 'store', 'source']) || 'Direct').trim(),
      month: standardizeMonth(getVal('month', ['month', 'date', 'period', 'bill date'])),
      invoiceNumber: String(getVal('referenceNumber', ['invoice number', 'reference_number', 'ref', 'invoice no', 'inv no']) || '').trim(),
      name: String(getVal('name', ['seller / brand name', 'account_name', 'seller', 'brand', 'name', 'vendor']) || '').trim(),
      desc: String(getVal('desc', ['expense type', 'transaction_details', 'description', 'desc', 'category']) || 'General Expense').trim(),
      invoice: inv,
      credit: cred,
      netValue: netVal,
    };
  }

  if (targetType === 'payment') {
    return {
      Payment_No: String(getVal('paymentNo', ['payment no', 'payment', 'id', 'ref', 'reference_number', 'txn_id', 'utr']) || `PAY-${rowIndex + 1}`).trim(),
      Bank_Entry_Date: String(getVal('date', ['bank entry date', 'date', 'bank date', 'payout date']) || new Date().toISOString().split('T')[0]).trim(),
      Description: String(getVal('desc', ['description', 'desc', 'details', 'narration', 'payout info']) || 'Marketplace Settlement').trim(),
      Amount: parseNumeric(getVal('amount', ['amount', 'value', 'payment amount', 'credited amount', 'net amount', 'credit', 'debit'])),
      Channel: String(getVal('channel', ['channel', 'marketplace', 'source', 'bank']) || 'Bank Account').trim(),
      Month: standardizeMonth(getVal('month', ['month', 'period', 'date']))
    };
  }

  if (targetType === 'sales') {
    const debit = parseNumeric(getVal('debit', ['debit', 'invoice', 'invoice value', 'gross sales', 'sales', 'amount', 'total', 'billed amount']));
    const credit = parseNumeric(getVal('credit', ['credit', 'sales return', 'return', 'credit note', 'credit note value', 'refund', 'discount']));
    const transType = String(getVal('type', ['transaction_type', 'type', 'transaction type', 'voucher type', 'doc type']) || '').trim();
    const rawNet = parseNumeric(getVal('net', ['net_amount', 'net amount', 'net value', 'net sales', 'net']));
    const netAmt = rawNet !== 0 ? rawNet : (credit !== 0 && debit === 0 ? credit : (debit !== 0 && credit === 0 ? debit : Math.abs(debit - credit)));
    const docStatus = String(getVal('status', ['document status', 'document_status', 'status', 'state', 'doc status', 'final status', 'payment status']) || '').trim();
    const finalStatus = String(getVal('finalStatus', ['final status', 'final_status', 'payment status']) || docStatus || 'Paid').trim();

    return {
      Month: standardizeMonth(getVal('month', ['month', 'date', 'period', 'bill date', 'invoice date'])),
      Channel: String(getVal('channel', ['channel', 'marketplace', 'platform', 'store', 'source']) || 'Direct').trim(),
      Date: String(getVal('date', ['date', 'month', 'invoice date', 'bill date']) || new Date().toISOString().split('T')[0]).trim(),
      Account_Name: String(getVal('name', ['account_name', 'customer name', 'customer', 'party name', 'party', 'name', 'seller', 'brand']) || '').trim(),
      Transaction_Details: String(getVal('desc', ['transaction_details', 'desc', 'details', 'item details', 'expense type', 'narration', 'sku']) || '').trim(),
      Transaction_Type: transType || 'Invoice',
      Reference_Number: String(getVal('referenceNumber', ['reference_number', 'invoice number', 'invoice no', 'inv no', 'ref', 'ref no']) || `INV-${rowIndex + 1}`).trim(),
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

  // targetType === 'purchase'
  const debit = parseNumeric(getVal('debit', ['debit', 'purchase', 'purchase bill', 'bill amount', 'invoice value', 'bill', 'amount', 'gross', 'cogs', 'total']));
  const credit = parseNumeric(getVal('credit', ['credit', 'vendor credit', 'return', 'purchase return', 'credit note', 'debit note', 'discount', 'refund']));
  const transType = String(getVal('type', ['transaction_type', 'type', 'transaction type', 'voucher type', 'doc type']) || '').trim();
  const rawNet = parseNumeric(getVal('net', ['net_amount', 'net amount', 'net value', 'net purchase', 'net']));
  const netAmt = rawNet !== 0 ? rawNet : (debit !== 0 ? debit : (credit !== 0 ? credit : 0));
  const docStatus = String(getVal('status', ['document status', 'document_status', 'status', 'state', 'doc status', 'final status', 'payment status', 'due status']) || '').trim();
  const finalStatus = String(getVal('finalStatus', ['final status', 'final_status', 'payment status']) || docStatus || 'Paid').trim();

  return {
    Month: standardizeMonth(getVal('month', ['month', 'date', 'period', 'bill date', 'invoice date'])),
    Channel: String(getVal('channel', ['channel', 'supplier', 'vendor', 'category', 'marketplace', 'source']) || 'Supplier').trim(),
    Date: String(getVal('date', ['date', 'month', 'bill date', 'invoice date']) || new Date().toISOString().split('T')[0]).trim(),
    Account_Name: String(getVal('name', ['account_name', 'supplier name', 'vendor name', 'supplier', 'vendor', 'party name', 'party', 'name']) || '').trim(),
    Transaction_Details: String(getVal('desc', ['transaction_details', 'desc', 'details', 'item details', 'expense type', 'narration']) || '').trim(),
    Transaction_Type: transType || 'Bill',
    Reference_Number: String(getVal('referenceNumber', ['reference_number', 'bill no', 'bill number', 'invoice number', 'ref', 'ref no', 'voucher no']) || `BILL-${rowIndex + 1}`).trim(),
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

// Diagnostic schema validation utility function for business_ledger_db collections
export function validateAndDiagnoseSchema(
  collectionName: 'sales' | 'purchases' | 'expenses' | 'payments' | string,
  records: any[]
) {
  const errors: {
    index: number;
    recordSummary: string;
    missingFields: string[];
    typeErrors: string[];
    details: string;
  }[] = [];

  if (!Array.isArray(records)) {
    return {
      isValid: false,
      totalChecked: 0,
      validCount: 0,
      invalidCount: 0,
      collection: collectionName,
      errors: [{ index: 0, recordSummary: 'Root payload', missingFields: [], typeErrors: ['Payload is not an array'], details: 'Expected an array of documents' }],
      timestamp: new Date().toISOString(),
    };
  }

  records.forEach((record, index) => {
    if (!record || typeof record !== 'object') {
      errors.push({
        index,
        recordSummary: String(record),
        missingFields: [],
        typeErrors: ['Not an object'],
        details: 'Record is null, undefined, or primitive',
      });
      return;
    }

    const missingFields: string[] = [];
    const typeErrors: string[] = [];

    if (collectionName === 'sales') {
      if (!record.Month || typeof record.Month !== 'string') missingFields.push('Month');
      if (!record.Channel || typeof record.Channel !== 'string') missingFields.push('Channel');
      if (record.Debit !== undefined && typeof record.Debit !== 'number') typeErrors.push('Debit should be number');
      if (record.Credit !== undefined && typeof record.Credit !== 'number') typeErrors.push('Credit should be number');
      if (record.Net_Amount !== undefined && typeof record.Net_Amount !== 'number') typeErrors.push('Net_Amount should be number');
    } else if (collectionName === 'purchases' || collectionName === 'purchase') {
      if (!record.Month || typeof record.Month !== 'string') missingFields.push('Month');
      if (!record.Channel || typeof record.Channel !== 'string') missingFields.push('Channel');
      if (record.Debit !== undefined && typeof record.Debit !== 'number') typeErrors.push('Debit should be number');
      if (record.Credit !== undefined && typeof record.Credit !== 'number') typeErrors.push('Credit should be number');
    } else if (collectionName === 'expenses' || collectionName === 'expense') {
      if (!record.month || typeof record.month !== 'string') missingFields.push('month');
      if (!record.marketplace || typeof record.marketplace !== 'string') missingFields.push('marketplace');
      if (record.netValue !== undefined && typeof record.netValue !== 'number') typeErrors.push('netValue should be number');
    } else if (collectionName === 'payments' || collectionName === 'payment') {
      if (!record.Payment_No) missingFields.push('Payment_No');
      if (record.Amount !== undefined && typeof record.Amount !== 'number') typeErrors.push('Amount should be number');
    }

    if (missingFields.length > 0 || typeErrors.length > 0) {
      const summary = record.Reference_Number || record.invoiceNumber || record.Payment_No || record.name || record.Account_Name || `Row #${index + 1}`;
      errors.push({
        index,
        recordSummary: String(summary),
        missingFields,
        typeErrors,
        details: [
          missingFields.length ? `Missing required: [${missingFields.join(', ')}]` : '',
          typeErrors.length ? `Type errors: [${typeErrors.join(', ')}]` : '',
        ].filter(Boolean).join(' | '),
      });
    }
  });

  const diagnosticResult = {
    isValid: errors.length === 0,
    totalChecked: records.length,
    validCount: records.length - errors.length,
    invalidCount: errors.length,
    collection: collectionName,
    errors: errors.slice(0, 50), // Cap diagnostic logs to 50 sample items to prevent giant payloads
    timestamp: new Date().toISOString(),
  };

  if (errors.length > 0) {
    console.warn(
      `⚠️ [business_ledger_db Schema Validation] Found ${errors.length}/${records.length} invalid records in collection "${collectionName}":`,
      errors.slice(0, 5)
    );
  } else {
    console.log(`✅ [business_ledger_db Schema Validation] All ${records.length} records in collection "${collectionName}" conform strictly to MongoDB schema.`);
  }

  return diagnosticResult;
}
