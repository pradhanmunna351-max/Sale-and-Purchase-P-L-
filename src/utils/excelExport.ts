import ExcelJS from 'exceljs';
import { SalesRecord, PurchaseRecord, ExpenseEntry, PaymentRecord } from '../types';
import { standardizeMonth, parseMonthTimestamp } from './monthUtils';
import { classifySalesRecord, classifyPurchaseRecord, parseNum } from './recordClassifier';
import { generateBusinessInsights } from './aiAnalysis';

// Color Palette for Excel Sheets
const THEME = {
  headerDark: '1E3A3A',       // Deep Forest Teal
  headerSales: '0284C7',      // Sky Blue
  headerPurchase: 'DC2626',   // Crimson Red
  headerExpense: 'D97706',    // Amber
  headerPL: '0D9488',         // Teal
  headerOutstanding: '4F46E5',// Indigo
  accentGreen: '10B981',      // Emerald Green
  cardBg1: 'ECFDF5',          // Light Green
  cardBg2: 'EFF6FF',          // Light Blue
  cardBg3: 'FEF2F2',          // Light Red
  cardBg4: 'FFFBEB',          // Light Amber
  cardBg5: 'F5F3FF',          // Light Purple
  zebraBg: 'F8FAFC',          // Soft slate
  borderLight: 'E2E8F0',      // Soft Border
  borderDark: '94A3B8',
  textDark: '0F172A',
  textMuted: '64748B',
  white: 'FFFFFF',
  tableHeadSub: '334155',
};

export interface ExcelExportOptions {
  includeSummary?: boolean;
  includeSales?: boolean;
  includePurchase?: boolean;
  includeExpense?: boolean;
  includeOutstanding?: boolean;
  includePayment?: boolean;
  includeRegisters?: boolean;
  selectedMonths?: string[];
}

export async function generateMasterExcelReport(
  rawSalesData: SalesRecord[] = [],
  rawPurchaseData: PurchaseRecord[] = [],
  rawExpenseData: ExpenseEntry[] = [],
  rawPaymentData: PaymentRecord[] = [],
  options: ExcelExportOptions = {}
): Promise<void> {
  const {
    includeSummary = true,
    includeSales = true,
    includePurchase = true,
    includeExpense = true,
    includeOutstanding = true,
    includePayment = true,
    includeRegisters = true,
    selectedMonths,
  } = options;

  // Filter datasets by selectedMonths if specified
  let salesData = rawSalesData;
  let purchaseData = rawPurchaseData;
  let expenseData = rawExpenseData;
  let paymentData = rawPaymentData;

  if (selectedMonths && selectedMonths.length > 0) {
    const monthSet = new Set(selectedMonths.map((m) => standardizeMonth(m)));
    salesData = rawSalesData.filter((s) => s.Month && monthSet.has(standardizeMonth(s.Month)));
    purchaseData = rawPurchaseData.filter((p) => p.Month && monthSet.has(standardizeMonth(p.Month)));
    expenseData = rawExpenseData.filter((e) => e.month && monthSet.has(standardizeMonth(e.month)));
    paymentData = rawPaymentData.filter((p) => p.Month && monthSet.has(standardizeMonth(p.Month)));
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Business Ledger System';
  workbook.lastModifiedBy = 'Business Ledger System';
  workbook.created = new Date();
  workbook.modified = new Date();

  // ----------------------------------------------------
  // DATA COMPUTATIONS
  // ----------------------------------------------------

  // 1. Sales Computations
  let totalGrossSales = 0;
  let totalSalesReturns = 0;
  let salesInvoicesCount = 0;
  let salesReturnsCount = 0;
  const salesChannelMap: Record<string, { gross: number; returns: number; net: number; invCount: number; retCount: number }> = {};
  const salesMonthMap: Record<string, { gross: number; returns: number; net: number; invCount: number; retCount: number }> = {};
  const salesStatusMap: Record<string, { count: number; total: number }> = {};
  const salesCustomerMap: Record<string, { party: string; invCount: number; retCount: number; gross: number; returns: number; net: number }> = {};

  salesData.forEach((s) => {
    const { isInvoice, isReturn, invVal, retVal } = classifySalesRecord(s);
    const net = invVal - retVal;

    if (isInvoice) {
      salesInvoicesCount++;
    } else {
      salesReturnsCount++;
    }

    totalGrossSales += invVal;
    totalSalesReturns += retVal;

    const ch = String(s.Channel || 'Unknown').trim() || 'Unknown';
    if (!salesChannelMap[ch]) salesChannelMap[ch] = { gross: 0, returns: 0, net: 0, invCount: 0, retCount: 0 };
    salesChannelMap[ch].gross += invVal;
    salesChannelMap[ch].returns += retVal;
    salesChannelMap[ch].net += net;
    if (isInvoice) salesChannelMap[ch].invCount += 1;
    else salesChannelMap[ch].retCount += 1;

    const m = standardizeMonth(s.Month) || 'Unknown';
    if (!salesMonthMap[m]) salesMonthMap[m] = { gross: 0, returns: 0, net: 0, invCount: 0, retCount: 0 };
    salesMonthMap[m].gross += invVal;
    salesMonthMap[m].returns += retVal;
    salesMonthMap[m].net += net;
    if (isInvoice) salesMonthMap[m].invCount += 1;
    else salesMonthMap[m].retCount += 1;

    const st = String(s['Final Status'] || s.Status || 'Pending').trim() || 'Pending';
    if (!salesStatusMap[st]) salesStatusMap[st] = { count: 0, total: 0 };
    salesStatusMap[st].count += 1;
    salesStatusMap[st].total += Math.abs(net);

    const partyName = String(
      s.Transaction_Details && s.Transaction_Details !== '-'
        ? s.Transaction_Details
        : s.Account_Name || s.Entity_Number || s.Channel || 'Unknown Customer'
    ).trim() || 'Unknown Customer';
    if (!salesCustomerMap[partyName]) {
      salesCustomerMap[partyName] = { party: partyName, invCount: 0, retCount: 0, gross: 0, returns: 0, net: 0 };
    }
    salesCustomerMap[partyName].gross += invVal;
    salesCustomerMap[partyName].returns += retVal;
    salesCustomerMap[partyName].net += net;
    if (isInvoice) salesCustomerMap[partyName].invCount += 1;
    else salesCustomerMap[partyName].retCount += 1;
  });

  const netSales = totalGrossSales - totalSalesReturns;
  const sortedSalesCustomers = Object.values(salesCustomerMap).sort((a, b) => b.net - a.net);

  // 2. Purchase Computations
  let totalGrossPurchases = 0;
  let totalVendorCredits = 0;
  let purchaseBillsCount = 0;
  let purchaseCreditsCount = 0;
  const purchaseChannelMap: Record<string, { gross: number; credits: number; net: number; billCount: number; credCount: number }> = {};
  const purchaseMonthMap: Record<string, { gross: number; credits: number; net: number; billCount: number; credCount: number }> = {};
  const purchaseStatusMap: Record<string, { count: number; total: number }> = {};
  const purchaseVendorPerformanceMap: Record<string, { vendor: string; billCount: number; credCount: number; gross: number; credits: number; net: number }> = {};

  purchaseData.forEach((p) => {
    const { isBill, isCredit, billVal, creditVal } = classifyPurchaseRecord(p);
    const net = billVal - creditVal;

    if (isBill) {
      purchaseBillsCount++;
    } else {
      purchaseCreditsCount++;
    }

    totalGrossPurchases += billVal;
    totalVendorCredits += creditVal;

    const ch = String(p.Channel || 'Unknown').trim() || 'Unknown';
    if (!purchaseChannelMap[ch]) purchaseChannelMap[ch] = { gross: 0, credits: 0, net: 0, billCount: 0, credCount: 0 };
    purchaseChannelMap[ch].gross += billVal;
    purchaseChannelMap[ch].credits += creditVal;
    purchaseChannelMap[ch].net += net;
    if (isBill) purchaseChannelMap[ch].billCount += 1;
    else purchaseChannelMap[ch].credCount += 1;

    const m = standardizeMonth(p.Month) || 'Unknown';
    if (!purchaseMonthMap[m]) purchaseMonthMap[m] = { gross: 0, credits: 0, net: 0, billCount: 0, credCount: 0 };
    purchaseMonthMap[m].gross += billVal;
    purchaseMonthMap[m].credits += creditVal;
    purchaseMonthMap[m].net += net;
    if (isBill) purchaseMonthMap[m].billCount += 1;
    else purchaseMonthMap[m].credCount += 1;

    const st = String(p['Final Status'] || p.Status || 'Pending').trim() || 'Pending';
    if (!purchaseStatusMap[st]) purchaseStatusMap[st] = { count: 0, total: 0 };
    purchaseStatusMap[st].count += 1;
    purchaseStatusMap[st].total += Math.abs(net);

    const vendorName = String(
      p.Transaction_Details && p.Transaction_Details !== '-'
        ? p.Transaction_Details
        : p.Account_Name || p.Entity_Number || p.Channel || 'Unknown Vendor'
    ).trim() || 'Unknown Vendor';
    if (!purchaseVendorPerformanceMap[vendorName]) {
      purchaseVendorPerformanceMap[vendorName] = { vendor: vendorName, billCount: 0, credCount: 0, gross: 0, credits: 0, net: 0 };
    }
    purchaseVendorPerformanceMap[vendorName].gross += billVal;
    purchaseVendorPerformanceMap[vendorName].credits += creditVal;
    purchaseVendorPerformanceMap[vendorName].net += net;
    if (isBill) purchaseVendorPerformanceMap[vendorName].billCount += 1;
    else purchaseVendorPerformanceMap[vendorName].credCount += 1;
  });

  const netPurchases = totalGrossPurchases - totalVendorCredits;
  const sortedPurchaseVendors = Object.values(purchaseVendorPerformanceMap).sort((a, b) => b.net - a.net);

  // 3. Expense Computations
  let totalGrossExpenses = 0;
  let totalExpenseCredits = 0;
  let totalNetExpenses = 0;
  const expenseMarketplaceMap: Record<string, { marketplace: string; invoice: number; credit: number; net: number; count: number }> = {};
  const expenseTypeMap: Record<string, { type: string; invoice: number; credit: number; net: number; count: number }> = {};
  const expenseBrandMap: Record<string, { brand: string; invoice: number; credit: number; net: number; count: number }> = {};
  const expenseMonthMap: Record<string, { month: string; invoice: number; credit: number; net: number; count: number }> = {};

  expenseData.forEach((e) => {
    const inv = parseNum(e.invoice);
    const cr = parseNum(e.credit);
    const net = inv - cr;

    totalGrossExpenses += inv;
    totalExpenseCredits += cr;
    totalNetExpenses += net;

    const mkt = String(e.marketplace || 'Unknown').trim() || 'Unknown';
    if (!expenseMarketplaceMap[mkt]) expenseMarketplaceMap[mkt] = { marketplace: mkt, invoice: 0, credit: 0, net: 0, count: 0 };
    expenseMarketplaceMap[mkt].invoice += inv;
    expenseMarketplaceMap[mkt].credit += cr;
    expenseMarketplaceMap[mkt].net += net;
    expenseMarketplaceMap[mkt].count += 1;

    const expType = String(e.desc || 'General Expense').trim() || 'General Expense';
    if (!expenseTypeMap[expType]) expenseTypeMap[expType] = { type: expType, invoice: 0, credit: 0, net: 0, count: 0 };
    expenseTypeMap[expType].invoice += inv;
    expenseTypeMap[expType].credit += cr;
    expenseTypeMap[expType].net += net;
    expenseTypeMap[expType].count += 1;

    const brandName = String(e.name || 'General / Unbranded').trim() || 'General / Unbranded';
    if (!expenseBrandMap[brandName]) expenseBrandMap[brandName] = { brand: brandName, invoice: 0, credit: 0, net: 0, count: 0 };
    expenseBrandMap[brandName].invoice += inv;
    expenseBrandMap[brandName].credit += cr;
    expenseBrandMap[brandName].net += net;
    expenseBrandMap[brandName].count += 1;

    const m = standardizeMonth(e.month) || 'Unknown';
    if (!expenseMonthMap[m]) expenseMonthMap[m] = { month: m, invoice: 0, credit: 0, net: 0, count: 0 };
    expenseMonthMap[m].invoice += inv;
    expenseMonthMap[m].credit += cr;
    expenseMonthMap[m].net += net;
    expenseMonthMap[m].count += 1;
  });

  const sortedExpMarketplaces = Object.values(expenseMarketplaceMap).sort((a, b) => b.net - a.net);
  const sortedExpTypes = Object.values(expenseTypeMap).sort((a, b) => b.net - a.net);
  const sortedExpBrands = Object.values(expenseBrandMap).sort((a, b) => b.net - a.net);
  const sortedExpMonths = Object.values(expenseMonthMap).sort((a, b) => parseMonthTimestamp(a.month) - parseMonthTimestamp(b.month));

  // 4. Payment Computations (Summary Level)
  let totalPaymentAmount = 0;
  const paymentChannelMap: Record<string, { channel: string; count: number; total: number }> = {};
  const paymentMonthMap: Record<string, { month: string; count: number; total: number }> = {};

  (paymentData || []).forEach((p) => {
    const amt = Number(p.Amount) || 0;
    totalPaymentAmount += amt;

    const ch = String(p.Channel || 'Unknown').trim() || 'Unknown';
    if (!paymentChannelMap[ch]) {
      paymentChannelMap[ch] = { channel: ch, count: 0, total: 0 };
    }
    paymentChannelMap[ch].count += 1;
    paymentChannelMap[ch].total += amt;

    const m = standardizeMonth(p.Month) || 'Unknown';
    if (!paymentMonthMap[m]) {
      paymentMonthMap[m] = { month: m, count: 0, total: 0 };
    }
    paymentMonthMap[m].count += 1;
    paymentMonthMap[m].total += amt;
  });

  const sortedPaymentChannels = Object.values(paymentChannelMap).sort((a, b) => b.total - a.total);
  const sortedPaymentMonths = Object.values(paymentMonthMap).sort((a, b) => parseMonthTimestamp(a.month) - parseMonthTimestamp(b.month));
  const avgPayment = paymentData && paymentData.length > 0 ? totalPaymentAmount / paymentData.length : 0;

  // ----------------------------------------------------
  // HELPER FUNCTIONS FOR DATE & OUTSTANDING
  // ----------------------------------------------------
  const parseDateToTimestamp = (dateStr: any): number | null => {
    if (!dateStr) return null;
    const str = String(dateStr).trim();
    if (!str) return null;

    // 1. If numeric Excel serial date (e.g. 45000)
    if (!isNaN(Number(str)) && Number(str) > 30000 && Number(str) < 60000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30)).getTime();
      return excelEpoch + Number(str) * 86400000;
    }

    // 2. Handle DD-MM-YYYY or DD/MM/YYYY
    const parts = str.split(/[-/]/);
    if (parts.length === 3 && parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length >= 2) {
      if (!isNaN(Number(parts[1]))) {
        const p1 = parseInt(parts[0], 10);
        const p2 = parseInt(parts[1], 10);
        let y = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        if (p1 <= 31 && p2 <= 12) {
          return new Date(y, p2 - 1, p1).getTime();
        }
      }
    }

    // 3. Fallback to standard Date parse
    const dTime = new Date(str).getTime();
    if (!isNaN(dTime)) return dTime;

    return null;
  };

  const calculateDaysOld = (dateStr: any): number => {
    const timestamp = parseDateToTimestamp(dateStr);
    if (!timestamp) return 0;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const d = new Date(timestamp);
    const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffMs = today - targetDate;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  };

  // 4. Sales Outstanding Computations
  let totalSalesOutstanding = 0;
  let salesInvoiceOpenVal = 0;
  let salesInvoiceOverdueVal = 0;
  let salesInvoiceOpenCount = 0;
  let salesInvoiceOverdueCount = 0;
  let salesCreditNoteOpenVal = 0;
  let salesCreditNoteOverdueVal = 0;
  let salesCreditNoteOpenCount = 0;
  let salesCreditNoteOverdueCount = 0;
  let salesInvoicesOutstandingCount = 0;
  let salesCreditNotesOutstandingCount = 0;
  
  let salesPaidVal = 0;
  let salesPaidCount = 0;
  let salesInvPaidVal = 0;
  let salesInvPaidCount = 0;
  let salesRetPaidVal = 0;
  let salesRetPaidCount = 0;

  let salesClosedVal = 0;
  let salesClosedCount = 0;
  let salesInvClosedVal = 0;
  let salesInvClosedCount = 0;
  let salesRetClosedVal = 0;
  let salesRetClosedCount = 0;

  let salesGrossInvoicesVal = 0;
  let salesGrossInvoicesCount = 0;
  let salesReturnsVal = 0;
  let salesReturnDocsCount = 0;

  const salesAgeing = { under30: 0, d30to60: 0, d60to90: 0, over90: 0 };
  const salesOutstandingItems: Array<{
    type: 'Sales';
    party: string;
    date: string;
    days: number;
    ref: string;
    channel: string;
    transType: string;
    status: string;
    amount: number;
    outstanding: number;
    isCredit: boolean;
  }> = [];

  // Settlement status classifier
  const classifySettlementStatus = (rawStatus: any, daysOld: number): 'Paid' | 'Closed' | 'Overdue' | 'Open' => {
    const statusLower = String(rawStatus || '').trim().toLowerCase();

    // 1. Paid / Settled / Completed
    if (
      statusLower.includes('paid') ||
      statusLower.includes('settled') ||
      statusLower.includes('completed')
    ) {
      return 'Paid';
    }

    // 2. Closed / Cancelled / Void / Adjusted
    if (
      statusLower.includes('closed') ||
      statusLower.includes('cancel') ||
      statusLower.includes('void')
    ) {
      return 'Closed';
    }

    // 3. Overdue (Explicit 'overdue' or days > 30 without explicit open/pending/unpaid status)
    if (
      statusLower.includes('overdue') ||
      (daysOld > 30 &&
        !statusLower.includes('open') &&
        !statusLower.includes('pending') &&
        !statusLower.includes('unpaid') &&
        !statusLower.includes('due') &&
        !statusLower.includes('draft'))
    ) {
      return 'Overdue';
    }

    // 4. Open / Current / Pending
    return 'Open';
  };

  salesData.forEach((s) => {
    const rawStatus = String(s.Document_Status || s.Status || s['Final Status'] || (s as any)['Document Status'] || '').trim();
    const days = calculateDaysOld(s.Date);

    const { isInvoice, isReturn, invVal, retVal } = classifySalesRecord(s);
    const docAmount = isInvoice ? invVal : retVal;

    if (isInvoice) {
      salesGrossInvoicesVal += invVal;
      salesGrossInvoicesCount++;
    } else {
      salesReturnsVal += retVal;
      salesReturnDocsCount++;
    }

    const status = classifySettlementStatus(rawStatus, days);

    if (status === 'Paid') {
      salesPaidCount++;
      if (isInvoice) {
        salesInvPaidCount++;
        salesInvPaidVal += docAmount;
      } else {
        salesRetPaidCount++;
        salesRetPaidVal += docAmount;
      }
    } else if (status === 'Closed') {
      salesClosedCount++;
      if (isInvoice) {
        salesInvClosedCount++;
        salesInvClosedVal += docAmount;
      } else {
        salesRetClosedCount++;
        salesRetClosedVal += docAmount;
      }
    } else if (status === 'Overdue') {
      const effectiveBal = isReturn ? -docAmount : docAmount;
      totalSalesOutstanding += effectiveBal;

      if (isReturn) {
        salesCreditNotesOutstandingCount++;
        salesCreditNoteOverdueVal += docAmount;
        salesCreditNoteOverdueCount++;
      } else {
        salesInvoicesOutstandingCount++;
        salesInvoiceOverdueVal += docAmount;
        salesInvoiceOverdueCount++;
      }

      if (days <= 30) salesAgeing.under30 += docAmount;
      else if (days <= 60) salesAgeing.d30to60 += docAmount;
      else if (days <= 90) salesAgeing.d60to90 += docAmount;
      else salesAgeing.over90 += docAmount;

      const partyName = String(
        s.Transaction_Details && s.Transaction_Details !== '-'
          ? s.Transaction_Details
          : s.Account_Name || s.Entity_Number || s.Channel || 'Unknown Customer'
      ).trim();

      salesOutstandingItems.push({
        type: 'Sales',
        party: partyName,
        date: s.Date || '',
        days,
        ref: s.Reference_Number || s.Entity_Number || '-',
        channel: s.Channel || 'Direct',
        transType: s.Transaction_Type || (isReturn ? 'Credit Note' : 'Invoice'),
        status: 'Overdue',
        amount: docAmount,
        outstanding: docAmount,
        isCredit: isReturn,
      });
    } else {
      // status === 'Open'
      const effectiveBal = isReturn ? -docAmount : docAmount;
      totalSalesOutstanding += effectiveBal;

      if (isReturn) {
        salesCreditNotesOutstandingCount++;
        salesCreditNoteOpenVal += docAmount;
        salesCreditNoteOpenCount++;
      } else {
        salesInvoicesOutstandingCount++;
        salesInvoiceOpenVal += docAmount;
        salesInvoiceOpenCount++;
      }

      if (days <= 30) salesAgeing.under30 += docAmount;
      else if (days <= 60) salesAgeing.d30to60 += docAmount;
      else if (days <= 90) salesAgeing.d60to90 += docAmount;
      else salesAgeing.over90 += docAmount;

      const partyName = String(
        s.Transaction_Details && s.Transaction_Details !== '-'
          ? s.Transaction_Details
          : s.Account_Name || s.Entity_Number || s.Channel || 'Unknown Customer'
      ).trim();

      salesOutstandingItems.push({
        type: 'Sales',
        party: partyName,
        date: s.Date || '',
        days,
        ref: s.Reference_Number || s.Entity_Number || '-',
        channel: s.Channel || 'Direct',
        transType: s.Transaction_Type || (isReturn ? 'Credit Note' : 'Invoice'),
        status: 'Open',
        amount: docAmount,
        outstanding: docAmount,
        isCredit: isReturn,
      });
    }
  });

  const salesOutstandingOpen = Math.round((salesInvoiceOpenVal - salesCreditNoteOpenVal) * 100) / 100;
  const salesOutstandingOverdue = Math.round((salesInvoiceOverdueVal - salesCreditNoteOverdueVal) * 100) / 100;
  totalSalesOutstanding = Math.round((salesOutstandingOpen + salesOutstandingOverdue) * 100) / 100;
  salesPaidVal = Math.round((salesInvPaidVal - salesRetPaidVal) * 100) / 100;
  salesInvPaidVal = Math.round(salesInvPaidVal * 100) / 100;
  salesRetPaidVal = Math.round(salesRetPaidVal * 100) / 100;
  salesClosedVal = Math.round((salesInvClosedVal - salesRetClosedVal) * 100) / 100;
  salesInvClosedVal = Math.round(salesInvClosedVal * 100) / 100;
  salesRetClosedVal = Math.round(salesRetClosedVal * 100) / 100;
  salesGrossInvoicesVal = Math.round(salesGrossInvoicesVal * 100) / 100;
  salesReturnsVal = Math.round(salesReturnsVal * 100) / 100;
  salesInvoiceOpenVal = Math.round(salesInvoiceOpenVal * 100) / 100;
  salesInvoiceOverdueVal = Math.round(salesInvoiceOverdueVal * 100) / 100;
  salesCreditNoteOpenVal = Math.round(salesCreditNoteOpenVal * 100) / 100;
  salesCreditNoteOverdueVal = Math.round(salesCreditNoteOverdueVal * 100) / 100;

  // 5. Purchase Outstanding Computations
  let totalPurchaseOutstanding = 0;
  let purchaseBillOpenVal = 0;
  let purchaseBillOverdueVal = 0;
  let purchaseBillOpenCount = 0;
  let purchaseBillOverdueCount = 0;
  let purchaseDebitNoteOpenVal = 0;
  let purchaseDebitNoteOverdueVal = 0;
  let purchaseDebitNoteOpenCount = 0;
  let purchaseDebitNoteOverdueCount = 0;
  let purchaseBillsOutstandingCount = 0;
  let purchaseDebitNotesOutstandingCount = 0;

  let purchasePaidVal = 0;
  let purchasePaidCount = 0;
  let purBillPaidVal = 0;
  let purBillPaidCount = 0;
  let purCredPaidVal = 0;
  let purCredPaidCount = 0;

  let purchaseClosedVal = 0;
  let purchaseClosedCount = 0;
  let purBillClosedVal = 0;
  let purBillClosedCount = 0;
  let purCredClosedVal = 0;
  let purCredClosedCount = 0;

  let purchaseGrossBillsVal = 0;
  let purchaseGrossBillsCount = 0;
  let purchaseCreditsVal = 0;
  let purchaseCreditDocsCount = 0;

  const purchaseAgeing = { under30: 0, d30to60: 0, d60to90: 0, over90: 0 };
  const purchaseOutstandingItems: Array<{
    type: 'Purchase';
    party: string;
    date: string;
    days: number;
    ref: string;
    channel: string;
    transType: string;
    status: string;
    amount: number;
    outstanding: number;
    isCredit: boolean;
  }> = [];

  purchaseData.forEach((p) => {
    const rawStatus = String(p.Document_Status || p.Status || p['Final Status'] || (p as any)['Document Status'] || '').trim();
    const days = calculateDaysOld(p.Date);

    const { isBill, isCredit, billVal, creditVal } = classifyPurchaseRecord(p);
    const docAmount = isBill ? billVal : creditVal;

    if (isBill) {
      purchaseGrossBillsVal += billVal;
      purchaseGrossBillsCount++;
    } else {
      purchaseCreditsVal += creditVal;
      purchaseCreditDocsCount++;
    }

    const status = classifySettlementStatus(rawStatus, days);

    if (status === 'Paid') {
      purchasePaidCount++;
      if (isBill) {
        purBillPaidCount++;
        purBillPaidVal += docAmount;
      } else {
        purCredPaidCount++;
        purCredPaidVal += docAmount;
      }
    } else if (status === 'Closed') {
      purchaseClosedCount++;
      if (isBill) {
        purBillClosedCount++;
        purBillClosedVal += docAmount;
      } else {
        purCredClosedCount++;
        purCredClosedVal += docAmount;
      }
    } else if (status === 'Overdue') {
      const effectiveBal = isCredit ? -docAmount : docAmount;
      totalPurchaseOutstanding += effectiveBal;

      if (isCredit) {
        purchaseDebitNotesOutstandingCount++;
        purchaseDebitNoteOverdueVal += docAmount;
        purchaseDebitNoteOverdueCount++;
      } else {
        purchaseBillsOutstandingCount++;
        purchaseBillOverdueVal += docAmount;
        purchaseBillOverdueCount++;
      }

      if (days <= 30) purchaseAgeing.under30 += docAmount;
      else if (days <= 60) purchaseAgeing.d30to60 += docAmount;
      else if (days <= 90) purchaseAgeing.d60to90 += docAmount;
      else purchaseAgeing.over90 += docAmount;

      const partyName = String(
        p.Transaction_Details && p.Transaction_Details !== '-'
          ? p.Transaction_Details
          : p.Account_Name || p.Entity_Number || p.Channel || 'Unknown Vendor'
      ).trim();

      purchaseOutstandingItems.push({
        type: 'Purchase',
        party: partyName,
        date: p.Date || '',
        days,
        ref: p.Reference_Number || p.Entity_Number || '-',
        channel: p.Channel || 'Supplier',
        transType: p.Transaction_Type || (isCredit ? 'Vendor Credit' : 'Bill'),
        status: 'Overdue',
        amount: docAmount,
        outstanding: docAmount,
        isCredit,
      });
    } else {
      // status === 'Open'
      const effectiveBal = isCredit ? -docAmount : docAmount;
      totalPurchaseOutstanding += effectiveBal;

      if (isCredit) {
        purchaseDebitNotesOutstandingCount++;
        purchaseDebitNoteOpenVal += docAmount;
        purchaseDebitNoteOpenCount++;
      } else {
        purchaseBillsOutstandingCount++;
        purchaseBillOpenVal += docAmount;
        purchaseBillOpenCount++;
      }

      if (days <= 30) purchaseAgeing.under30 += docAmount;
      else if (days <= 60) purchaseAgeing.d30to60 += docAmount;
      else if (days <= 90) purchaseAgeing.d60to90 += docAmount;
      else purchaseAgeing.over90 += docAmount;

      const partyName = String(
        p.Transaction_Details && p.Transaction_Details !== '-'
          ? p.Transaction_Details
          : p.Account_Name || p.Entity_Number || p.Channel || 'Unknown Vendor'
      ).trim();

      purchaseOutstandingItems.push({
        type: 'Purchase',
        party: partyName,
        date: p.Date || '',
        days,
        ref: p.Reference_Number || p.Entity_Number || '-',
        channel: p.Channel || 'Supplier',
        transType: p.Transaction_Type || (isCredit ? 'Vendor Credit' : 'Bill'),
        status: 'Open',
        amount: docAmount,
        outstanding: docAmount,
        isCredit,
      });
    }
  });

  const purchaseOutstandingOpen = Math.round((purchaseBillOpenVal - purchaseDebitNoteOpenVal) * 100) / 100;
  const purchaseOutstandingOverdue = Math.round((purchaseBillOverdueVal - purchaseDebitNoteOverdueVal) * 100) / 100;
  totalPurchaseOutstanding = Math.round((purchaseOutstandingOpen + purchaseOutstandingOverdue) * 100) / 100;
  purchasePaidVal = Math.round((purBillPaidVal - purCredPaidVal) * 100) / 100;
  purBillPaidVal = Math.round(purBillPaidVal * 100) / 100;
  purCredPaidVal = Math.round(purCredPaidVal * 100) / 100;
  purchaseClosedVal = Math.round((purBillClosedVal - purCredClosedVal) * 100) / 100;
  purBillClosedVal = Math.round(purBillClosedVal * 100) / 100;
  purCredClosedVal = Math.round(purCredClosedVal * 100) / 100;
  purchaseGrossBillsVal = Math.round(purchaseGrossBillsVal * 100) / 100;
  purchaseCreditsVal = Math.round(purchaseCreditsVal * 100) / 100;
  purchaseBillOpenVal = Math.round(purchaseBillOpenVal * 100) / 100;
  purchaseBillOverdueVal = Math.round(purchaseBillOverdueVal * 100) / 100;
  purchaseDebitNoteOpenVal = Math.round(purchaseDebitNoteOpenVal * 100) / 100;
  purchaseDebitNoteOverdueVal = Math.round(purchaseDebitNoteOverdueVal * 100) / 100;

  // Aggregate All Outstanding Items
  const allOutstandingItems = [...salesOutstandingItems, ...purchaseOutstandingItems].sort((a, b) => b.days - a.days);

  // Sales Party Outstanding Map
  const salesPartyMap: Record<string, {
    party: string;
    inv: number;
    cred: number;
    open: number;
    overdue: number;
    total: number;
    count: number;
  }> = {};

  salesOutstandingItems.forEach((item) => {
    if (!salesPartyMap[item.party]) {
      salesPartyMap[item.party] = {
        party: item.party,
        inv: 0,
        cred: 0,
        open: 0,
        overdue: 0,
        total: 0,
        count: 0,
      };
    }
    const entry = salesPartyMap[item.party];
    entry.total += item.outstanding;
    entry.count += 1;
    if (item.isCredit) {
      entry.cred += Math.abs(item.outstanding);
    } else {
      entry.inv += Math.abs(item.outstanding);
    }
    if (item.status === 'Overdue') {
      entry.overdue += item.outstanding;
    } else {
      entry.open += item.outstanding;
    }
  });

  const sortedSalesParties = Object.values(salesPartyMap).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  // Purchase Party Outstanding Map
  const purchasePartyMap: Record<string, {
    party: string;
    bills: number;
    cred: number;
    open: number;
    overdue: number;
    total: number;
    count: number;
  }> = {};

  purchaseOutstandingItems.forEach((item) => {
    if (!purchasePartyMap[item.party]) {
      purchasePartyMap[item.party] = {
        party: item.party,
        bills: 0,
        cred: 0,
        open: 0,
        overdue: 0,
        total: 0,
        count: 0,
      };
    }
    const entry = purchasePartyMap[item.party];
    entry.total += item.outstanding;
    entry.count += 1;
    if (item.isCredit) {
      entry.cred += Math.abs(item.outstanding);
    } else {
      entry.bills += Math.abs(item.outstanding);
    }
    if (item.status === 'Overdue') {
      entry.overdue += item.outstanding;
    } else {
      entry.open += item.outstanding;
    }
  });

  const sortedPurchaseParties = Object.values(purchasePartyMap).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  // Sales Ageing Breakdown Rows
  const salesAgeingRows = [
    { horizon: '0 – 30 Days (Current)', inv: 0, cred: 0, open: 0, overdue: 0, total: 0, min: 0, max: 30 },
    { horizon: '31 – 60 Days (Aging)', inv: 0, cred: 0, open: 0, overdue: 0, total: 0, min: 31, max: 60 },
    { horizon: '61 – 90 Days (Late)', inv: 0, cred: 0, open: 0, overdue: 0, total: 0, min: 61, max: 90 },
    { horizon: '90+ Days (Critical / Overdue)', inv: 0, cred: 0, open: 0, overdue: 0, total: 0, min: 91, max: 999999 },
  ];

  salesOutstandingItems.forEach((it) => {
    const row = salesAgeingRows.find((r) => it.days >= r.min && it.days <= r.max) || salesAgeingRows[3];
    row.total += it.outstanding;
    if (it.isCredit) row.cred += Math.abs(it.outstanding);
    else row.inv += Math.abs(it.outstanding);

    if (it.status === 'Overdue') row.overdue += it.outstanding;
    else row.open += it.outstanding;
  });

  // Purchase Ageing Breakdown Rows
  const purchaseAgeingRows = [
    { horizon: '0 – 30 Days (Current)', bills: 0, cred: 0, open: 0, overdue: 0, total: 0, min: 0, max: 30 },
    { horizon: '31 – 60 Days (Aging)', bills: 0, cred: 0, open: 0, overdue: 0, total: 0, min: 31, max: 60 },
    { horizon: '61 – 90 Days (Late)', bills: 0, cred: 0, open: 0, overdue: 0, total: 0, min: 61, max: 90 },
    { horizon: '90+ Days (Critical / Overdue)', bills: 0, cred: 0, open: 0, overdue: 0, total: 0, min: 91, max: 999999 },
  ];

  purchaseOutstandingItems.forEach((it) => {
    const row = purchaseAgeingRows.find((r) => it.days >= r.min && it.days <= r.max) || purchaseAgeingRows[3];
    row.total += it.outstanding;
    if (it.isCredit) row.cred += Math.abs(it.outstanding);
    else row.bills += Math.abs(it.outstanding);

    if (it.status === 'Overdue') row.overdue += it.outstanding;
    else row.open += it.outstanding;
  });

  // Consolidated Party & Vendor Summary Map
  const partyOutstandingMap: Record<string, {
    type: string;
    party: string;
    invBill: number;
    credNote: number;
    open: number;
    overdue: number;
    total: number;
    count: number;
  }> = {};

  allOutstandingItems.forEach((item) => {
    const key = `${item.type}_${item.party}`;
    if (!partyOutstandingMap[key]) {
      partyOutstandingMap[key] = {
        type: item.type,
        party: item.party,
        invBill: 0,
        credNote: 0,
        open: 0,
        overdue: 0,
        total: 0,
        count: 0,
      };
    }
    const entry = partyOutstandingMap[key];
    entry.total += item.outstanding;
    entry.count += 1;
    if (item.isCredit) {
      entry.credNote += Math.abs(item.outstanding);
    } else {
      entry.invBill += Math.abs(item.outstanding);
    }

    if (item.status === 'Overdue') {
      entry.overdue += item.outstanding;
    } else {
      entry.open += item.outstanding;
    }
  });

  Object.values(partyOutstandingMap).forEach((p) => {
    p.total = Math.round(p.total * 100) / 100;
    p.invBill = Math.round(p.invBill * 100) / 100;
    p.credNote = Math.round(p.credNote * 100) / 100;
    p.open = Math.round(p.open * 100) / 100;
    p.overdue = Math.round(p.overdue * 100) / 100;
  });

  const ageingBuckets = {
    sales: salesAgeing,
    purchase: purchaseAgeing,
  };

  // Gross profit & Net profit
  const grossProfit = netSales - netPurchases;
  const netProfit = grossProfit - totalNetExpenses;
  const profitMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0;

  // Sorted unique months
  const allMonthsSet = new Set<string>();
  Object.keys(salesMonthMap).forEach((m) => allMonthsSet.add(m));
  Object.keys(purchaseMonthMap).forEach((m) => allMonthsSet.add(m));
  Object.keys(expenseMonthMap).forEach((m) => allMonthsSet.add(m));
  const sortedMonths = Array.from(allMonthsSet).sort((a, b) => parseMonthTimestamp(a) - parseMonthTimestamp(b));

  // Channel & Month Breakdown Computations
  const monthChannelMap: Record<string, {
    month: string;
    channel: string;
    grossSales: number;
    salesReturns: number;
    netSales: number;
    grossPurchases: number;
    vendorCredits: number;
    netPurchases: number;
    invCount: number;
    retCount: number;
    billCount: number;
    credCount: number;
  }> = {};

  salesData.forEach((s) => {
    const { isInvoice, isReturn, invoiceVal, returnVal } = classifySalesRecord(s);
    const m = standardizeMonth(s.Month) || 'Unknown';
    const ch = String(s.Channel || 'Unknown').trim() || 'Unknown';
    const key = `${m}__${ch}`;
    if (!monthChannelMap[key]) {
      monthChannelMap[key] = {
        month: m,
        channel: ch,
        grossSales: 0,
        salesReturns: 0,
        netSales: 0,
        grossPurchases: 0,
        vendorCredits: 0,
        netPurchases: 0,
        invCount: 0,
        retCount: 0,
        billCount: 0,
        credCount: 0,
      };
    }
    monthChannelMap[key].grossSales += invoiceVal;
    monthChannelMap[key].salesReturns += returnVal;
    monthChannelMap[key].netSales += (invoiceVal - returnVal);
    if (isInvoice) monthChannelMap[key].invCount += 1;
    else monthChannelMap[key].retCount += 1;
  });

  purchaseData.forEach((p) => {
    const { isBill, isCredit, billVal, creditVal } = classifyPurchaseRecord(p);
    const m = standardizeMonth(p.Month) || 'Unknown';
    const ch = String(p.Channel || 'Unknown').trim() || 'Unknown';
    const key = `${m}__${ch}`;
    if (!monthChannelMap[key]) {
      monthChannelMap[key] = {
        month: m,
        channel: ch,
        grossSales: 0,
        salesReturns: 0,
        netSales: 0,
        grossPurchases: 0,
        vendorCredits: 0,
        netPurchases: 0,
        invCount: 0,
        retCount: 0,
        billCount: 0,
        credCount: 0,
      };
    }
    monthChannelMap[key].grossPurchases += billVal;
    monthChannelMap[key].vendorCredits += creditVal;
    monthChannelMap[key].netPurchases += (billVal - creditVal);
    if (isBill) monthChannelMap[key].billCount += 1;
    else monthChannelMap[key].credCount += 1;
  });

  const sortedMonthChannelList = Object.values(monthChannelMap).sort((a, b) => {
    const tA = parseMonthTimestamp(a.month);
    const tB = parseMonthTimestamp(b.month);
    if (tA !== tB) return tA - tB;
    return b.netSales - a.netSales;
  });

  const allChannelsList = Array.from(new Set([
    ...Object.keys(salesChannelMap),
    ...Object.keys(purchaseChannelMap),
  ])).sort((a, b) => {
    const netA = (salesChannelMap[a]?.net || 0);
    const netB = (salesChannelMap[b]?.net || 0);
    return netB - netA;
  });

  // Helper border styling
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: THEME.borderLight } },
    left: { style: 'thin', color: { argb: THEME.borderLight } },
    bottom: { style: 'thin', color: { argb: THEME.borderLight } },
    right: { style: 'thin', color: { argb: THEME.borderLight } },
  };

  const totalBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'medium', color: { argb: THEME.borderDark } },
    bottom: { style: 'double', color: { argb: THEME.borderDark } },
    left: { style: 'thin', color: { argb: THEME.borderLight } },
    right: { style: 'thin', color: { argb: THEME.borderLight } },
  };

  // KPI Helper
  const addKpiCard = (
    sheet: ExcelJS.Worksheet,
    startCol: string,
    endCol: string,
    title: string,
    valText: number | string,
    subText: string,
    bgColor: string,
    textColor: string,
    startRow: number = 4
  ) => {
    const startNum = sheet.getColumn(startCol).number;
    const endNum = sheet.getColumn(endCol).number;

    sheet.mergeCells(`${startCol}${startRow}:${endCol}${startRow}`);
    sheet.mergeCells(`${startCol}${startRow + 1}:${endCol}${startRow + 1}`);
    sheet.mergeCells(`${startCol}${startRow + 2}:${endCol}${startRow + 2}`);

    const cTitle = sheet.getCell(`${startCol}${startRow}`);
    cTitle.value = title;
    cTitle.font = { name: 'Arial', size: 9, bold: true, color: { argb: THEME.textMuted } };
    cTitle.alignment = { horizontal: 'center', vertical: 'middle' };

    const cVal = sheet.getCell(`${startCol}${startRow + 1}`);
    cVal.value = valText;
    if (typeof valText === 'number') {
      if (title.includes('CHANNELS') || title.includes('PLATFORMS') || title.includes('PERIODS') || title.includes('COUNT') || title.includes('TYPES')) {
        cVal.numFmt = '#,##0';
      } else {
        cVal.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      }
    }
    cVal.font = { name: 'Arial', size: 13, bold: true, color: { argb: textColor } };
    cVal.alignment = { horizontal: 'center', vertical: 'middle' };

    const cSub = sheet.getCell(`${startCol}${startRow + 2}`);
    cSub.value = subText;
    cSub.font = { name: 'Arial', size: 8, italic: true, color: { argb: THEME.textMuted } };
    cSub.alignment = { horizontal: 'center', vertical: 'middle' };

    for (let r = startRow; r <= startRow + 2; r++) {
      for (let c = startNum; c <= endNum; c++) {
        const cell = sheet.getRow(r).getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.border = thinBorder;
      }
    }
  };

  // =========================================================================
  // SHEET 1: 📊 EXECUTIVE SUMMARY (MASTER DASHBOARD)
  // =========================================================================
  if (includeSummary) {
    const wsSummary = workbook.addWorksheet('📊 Summary Dashboard', {
      views: [{ showGridLines: false }],
      properties: { tabColor: { argb: THEME.headerDark } },
    });

  // Title Banner
  wsSummary.mergeCells('A1:K1');
  const title1 = wsSummary.getCell('A1');
  title1.value = 'BUSINESS EXECUTIVE DASHBOARD & MASTER FINANCIAL STATEMENT';
  title1.font = { name: 'Arial', size: 16, bold: true, color: { argb: THEME.white } };
  title1.alignment = { horizontal: 'center', vertical: 'middle' };
  title1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerDark } };
  wsSummary.getRow(1).height = 42;

  wsSummary.mergeCells('A2:K2');
  const sub1 = wsSummary.getCell('A2');
  sub1.value = `Report Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-IN')} | Master Financial P&L Audit`;
  sub1.font = { name: 'Arial', size: 10, italic: true, color: { argb: THEME.textMuted } };
  sub1.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSummary.getRow(2).height = 20;

  const insights = generateBusinessInsights(salesData, purchaseData, expenseData, paymentData);
  let currentRow = 4;
  
  // --- AI ANALYSIS SECTION ---
  wsSummary.mergeCells(`A${currentRow}:K${currentRow}`);
  const aiHeader = wsSummary.getCell(`A${currentRow}`);
  aiHeader.value = '🤖 AI BUSINESS ANALYSIS & ACTIONABLE NOTES';
  aiHeader.font = { name: 'Arial', size: 11, bold: true, color: { argb: '7C3AED' } };
  aiHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3E8FF' } }; 
  aiHeader.alignment = { vertical: 'middle', indent: 1 };
  wsSummary.getRow(currentRow).height = 24;
  currentRow++;

  if (insights.notes.length === 0) {
    wsSummary.mergeCells(`A${currentRow}:K${currentRow}`);
    const nCell = wsSummary.getCell(`A${currentRow}`);
    nCell.value = 'Not enough data to generate insights.';
    nCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: THEME.textDark } };
    wsSummary.getRow(currentRow).height = 24;
    currentRow++;
  } else {
    insights.notes.forEach(note => {
      wsSummary.mergeCells(`A${currentRow}:K${currentRow}`);
      const noteCell = wsSummary.getCell(`A${currentRow}`);
      noteCell.value = `• ${note}`;
      noteCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: THEME.textDark } };
      noteCell.alignment = { vertical: 'middle', wrapText: true };
      wsSummary.getRow(currentRow).height = 30; // taller for wrap
      currentRow++;
    });
  }

  currentRow++;
  const kpiStartRow = currentRow; // this will be passed to addKpiCard

  addKpiCard(wsSummary, 'A', 'C', '💰 NET SALES', netSales, `Gross: ₹${totalGrossSales.toLocaleString('en-IN', { maximumFractionDigits: 0 })} | Ret: ₹${totalSalesReturns.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, THEME.cardBg2, THEME.headerSales, kpiStartRow);
  addKpiCard(wsSummary, 'D', 'F', '🛒 NET PURCHASES', netPurchases, `Bills: ₹${totalGrossPurchases.toLocaleString('en-IN', { maximumFractionDigits: 0 })} | Cr: ₹${totalVendorCredits.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, THEME.cardBg3, THEME.headerPurchase, kpiStartRow);
  addKpiCard(wsSummary, 'G', 'H', '📋 NET EXPENSES', totalNetExpenses, `Invoices: ₹${totalGrossExpenses.toLocaleString('en-IN', { maximumFractionDigits: 0 })} | Cr: ₹${totalExpenseCredits.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, THEME.cardBg4, THEME.headerExpense, kpiStartRow);
  addKpiCard(wsSummary, 'I', 'K', '📈 NET PROFIT / LOSS', netProfit, `Margin: ${profitMargin.toFixed(2)}% | Gross: ₹${grossProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, netProfit >= 0 ? THEME.cardBg1 : THEME.cardBg3, netProfit >= 0 ? THEME.accentGreen : THEME.headerPurchase, kpiStartRow);

  wsSummary.getRow(kpiStartRow).height = 18;
  wsSummary.getRow(kpiStartRow + 1).height = 24;
  wsSummary.getRow(kpiStartRow + 2).height = 18;

  currentRow = kpiStartRow + 4; // space before table

  // P&L Statement on Summary Dashboard
  wsSummary.mergeCells(`A${currentRow}:K${currentRow}`);
  const secTitle1 = wsSummary.getCell(`A${currentRow}`);
  secTitle1.value = '📈 PROFIT & LOSS DETAILED STATEMENT & MARGIN ANALYSIS';
  secTitle1.font = { name: 'Arial', size: 11, bold: true, color: { argb: THEME.white } };
  secTitle1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerPL } };
  secTitle1.alignment = { vertical: 'middle', indent: 1 };
  wsSummary.getRow(currentRow).height = 24;
  currentRow++;

  const summaryPLHeaders = [
    'Month',
    'Gross Sales (₹)',
    'Sales Returns (₹)',
    'Net Sales (₹)',
    'Gross Purchases (₹)',
    'Vendor Credits (₹)',
    'Net Purchases (₹)',
    'Gross Profit (₹)',
    'Operating Expenses (₹)',
    'Net Profit / Loss (₹)',
    'Net Profit Margin (%)',
  ];

  const headRow1 = wsSummary.getRow(currentRow);
  summaryPLHeaders.forEach((h, idx) => {
    const cell = headRow1.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerDark } };
    cell.alignment = { horizontal: idx === 0 ? 'left' : 'right', vertical: 'middle' };
    cell.border = thinBorder;
  });
  headRow1.height = 24;
  currentRow++;

  let rowCount1 = currentRow;
  const startRow1 = rowCount1;
  sortedMonths.forEach((m, idx) => {
    const sData = salesMonthMap[m] || { gross: 0, returns: 0, net: 0, invCount: 0, retCount: 0 };
    const pData = purchaseMonthMap[m] || { gross: 0, credits: 0, net: 0, billCount: 0, credCount: 0 };
    const eData = expenseMonthMap[m] || { invoice: 0, credit: 0, net: 0, count: 0 };

    const gSales = sData.gross;
    const rSales = sData.returns;
    const nSales = sData.net;
    const gPur = pData.gross;
    const cPur = pData.credits;
    const nPur = pData.net;
    const gp = nSales - nPur;
    const exp = eData.net;
    const np = gp - exp;
    const margin = nSales > 0 ? (np / nSales) * 100 : 0;

    const row = wsSummary.getRow(rowCount1);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;

    row.getCell(1).value = m;
    row.getCell(2).value = gSales;
    row.getCell(3).value = rSales;
    row.getCell(4).value = { formula: `B${rowCount1}-C${rowCount1}`, result: nSales };
    row.getCell(5).value = gPur;
    row.getCell(6).value = cPur;
    row.getCell(7).value = { formula: `E${rowCount1}-F${rowCount1}`, result: nPur };
    row.getCell(8).value = { formula: `D${rowCount1}-G${rowCount1}`, result: gp };
    row.getCell(9).value = exp;
    row.getCell(10).value = { formula: `H${rowCount1}-I${rowCount1}`, result: np };
    row.getCell(11).value = { formula: `IF(D${rowCount1}<>0, J${rowCount1}/D${rowCount1}, 0)`, result: margin / 100 };

    for (let c = 1; c <= 11; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 9, bold: c === 1 || c === 4 || c === 8 || c === 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
      if (c >= 2 && c <= 10) {
        cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      }
      if (c === 11) {
        cell.numFmt = '0.00%';
      }
      if (c === 10) {
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: np >= 0 ? THEME.accentGreen : THEME.headerPurchase } };
      }
    }
    row.height = 20;
    rowCount1++;
  });

  const endRow1 = rowCount1 - 1;

  // Total row for summary
  const totalRow1 = wsSummary.getRow(rowCount1);
  totalRow1.getCell(1).value = 'TOTAL / AVERAGE';
  if (sortedMonths.length > 0) {
    totalRow1.getCell(2).value = { formula: `SUM(B${startRow1}:B${endRow1})`, result: totalGrossSales };
    totalRow1.getCell(3).value = { formula: `SUM(C${startRow1}:C${endRow1})`, result: totalSalesReturns };
    totalRow1.getCell(4).value = { formula: `B${rowCount1}-C${rowCount1}`, result: netSales };
    totalRow1.getCell(5).value = { formula: `SUM(E${startRow1}:E${endRow1})`, result: totalGrossPurchases };
    totalRow1.getCell(6).value = { formula: `SUM(F${startRow1}:F${endRow1})`, result: totalVendorCredits };
    totalRow1.getCell(7).value = { formula: `E${rowCount1}-F${rowCount1}`, result: netPurchases };
    totalRow1.getCell(8).value = { formula: `D${rowCount1}-G${rowCount1}`, result: grossProfit };
    totalRow1.getCell(9).value = { formula: `SUM(I${startRow1}:I${endRow1})`, result: totalNetExpenses };
    totalRow1.getCell(10).value = { formula: `H${rowCount1}-I${rowCount1}`, result: netProfit };
    totalRow1.getCell(11).value = { formula: `IF(D${rowCount1}<>0, J${rowCount1}/D${rowCount1}, 0)`, result: profitMargin / 100 };
  } else {
    totalRow1.getCell(2).value = totalGrossSales;
    totalRow1.getCell(3).value = totalSalesReturns;
    totalRow1.getCell(4).value = netSales;
    totalRow1.getCell(5).value = totalGrossPurchases;
    totalRow1.getCell(6).value = totalVendorCredits;
    totalRow1.getCell(7).value = netPurchases;
    totalRow1.getCell(8).value = grossProfit;
    totalRow1.getCell(9).value = totalNetExpenses;
    totalRow1.getCell(10).value = netProfit;
    totalRow1.getCell(11).value = profitMargin / 100;
  }

  for (let c = 1; c <= 11; c++) {
    const cell = totalRow1.getCell(c);
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
    if (c >= 2 && c <= 10) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 11) cell.numFmt = '0.00%';
  }
  totalRow1.height = 22;

  // =========================================================================
  // TABLE 2: 🏢 CHANNEL-WISE SALES & PURCHASE CONSOLIDATED SUMMARY
  // =========================================================================
  let summaryRow = rowCount1 + 3;
  wsSummary.mergeCells(`A${summaryRow}:K${summaryRow}`);
  const chanSecTitle = wsSummary.getCell(`A${summaryRow}`);
  chanSecTitle.value = '🏢 CHANNEL-WISE SALES & PURCHASE PERFORMANCE SUMMARY';
  chanSecTitle.font = { name: 'Arial', size: 11, bold: true, color: { argb: THEME.white } };
  chanSecTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0369A1' } };
  chanSecTitle.alignment = { vertical: 'middle', indent: 1 };
  wsSummary.getRow(summaryRow).height = 24;
  summaryRow++;

  const chanHeaders = [
    'Channel / Platform',
    'Gross Sales (₹)',
    'Sales Returns (₹)',
    'Net Sales (₹)',
    'Gross Purchases (₹)',
    'Vendor Credits (₹)',
    'Net Purchases (₹)',
    'Gross Profit (₹)',
    'Sales Invoices',
    'Purchase Bills',
    'Net Sales Share (%)',
  ];

  const headRowChan = wsSummary.getRow(summaryRow);
  chanHeaders.forEach((h, idx) => {
    const cell = headRowChan.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx === 0 ? 'left' : idx >= 8 && idx <= 9 ? 'center' : 'right', vertical: 'middle' };
    cell.border = thinBorder;
  });
  headRowChan.height = 24;
  summaryRow++;

  const chanStartRow = summaryRow;
  allChannelsList.forEach((ch, idx) => {
    const sData = salesChannelMap[ch] || { gross: 0, returns: 0, net: 0, invCount: 0, retCount: 0 };
    const pData = purchaseChannelMap[ch] || { gross: 0, credits: 0, net: 0, billCount: 0, credCount: 0 };
    const gp = sData.net - pData.net;
    const share = netSales > 0 ? (sData.net / netSales) * 100 : 0;
    const row = wsSummary.getRow(summaryRow);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;

    row.getCell(1).value = ch;
    row.getCell(2).value = sData.gross;
    row.getCell(3).value = sData.returns;
    row.getCell(4).value = { formula: `B${summaryRow}-C${summaryRow}`, result: sData.net };
    row.getCell(5).value = pData.gross;
    row.getCell(6).value = pData.credits;
    row.getCell(7).value = { formula: `E${summaryRow}-F${summaryRow}`, result: pData.net };
    row.getCell(8).value = { formula: `D${summaryRow}-G${summaryRow}`, result: gp };
    row.getCell(9).value = sData.invCount;
    row.getCell(10).value = pData.billCount;
    row.getCell(11).value = { formula: `IF(D$${rowCount1}<>0, D${summaryRow}/D$${rowCount1}, 0)`, result: share / 100 };

    for (let c = 1; c <= 11; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 9, bold: c === 1 || c === 4 || c === 7 || c === 8 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c === 1 ? 'left' : c >= 9 && c <= 10 ? 'center' : 'right', vertical: 'middle' };
      if (c >= 2 && c <= 8) {
        cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      }
      if (c >= 9 && c <= 10) {
        cell.numFmt = '#,##0';
      }
      if (c === 11) {
        cell.numFmt = '0.00%';
      }
      if (c === 8) {
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: gp >= 0 ? THEME.accentGreen : THEME.headerPurchase } };
      }
    }
    row.height = 20;
    summaryRow++;
  });

  const chanEndRow = summaryRow - 1;
  // Total row for Channel Table
  const totalRowChan = wsSummary.getRow(summaryRow);
  totalRowChan.getCell(1).value = 'TOTAL CHANNELS';
  if (allChannelsList.length > 0) {
    totalRowChan.getCell(2).value = { formula: `SUM(B${chanStartRow}:B${chanEndRow})`, result: totalGrossSales };
    totalRowChan.getCell(3).value = { formula: `SUM(C${chanStartRow}:C${chanEndRow})`, result: totalSalesReturns };
    totalRowChan.getCell(4).value = { formula: `B${summaryRow}-C${summaryRow}`, result: netSales };
    totalRowChan.getCell(5).value = { formula: `SUM(E${chanStartRow}:E${chanEndRow})`, result: totalGrossPurchases };
    totalRowChan.getCell(6).value = { formula: `SUM(F${chanStartRow}:F${chanEndRow})`, result: totalVendorCredits };
    totalRowChan.getCell(7).value = { formula: `E${summaryRow}-F${summaryRow}`, result: netPurchases };
    totalRowChan.getCell(8).value = { formula: `D${summaryRow}-G${summaryRow}`, result: grossProfit };
    totalRowChan.getCell(9).value = { formula: `SUM(I${chanStartRow}:I${chanEndRow})`, result: salesInvoicesCount };
    totalRowChan.getCell(10).value = { formula: `SUM(J${chanStartRow}:J${chanEndRow})`, result: purchaseBillsCount };
    totalRowChan.getCell(11).value = { formula: `SUM(K${chanStartRow}:K${chanEndRow})`, result: 1 };
  } else {
    totalRowChan.getCell(2).value = totalGrossSales;
    totalRowChan.getCell(3).value = totalSalesReturns;
    totalRowChan.getCell(4).value = netSales;
    totalRowChan.getCell(5).value = totalGrossPurchases;
    totalRowChan.getCell(6).value = totalVendorCredits;
    totalRowChan.getCell(7).value = netPurchases;
    totalRowChan.getCell(8).value = grossProfit;
    totalRowChan.getCell(9).value = salesInvoicesCount;
    totalRowChan.getCell(10).value = purchaseBillsCount;
    totalRowChan.getCell(11).value = 1;
  }

  for (let c = 1; c <= 11; c++) {
    const cell = totalRowChan.getCell(c);
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : c >= 9 && c <= 10 ? 'center' : 'right', vertical: 'middle' };
    if (c >= 2 && c <= 8) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c >= 9 && c <= 10) cell.numFmt = '#,##0';
    if (c === 11) cell.numFmt = '0.00%';
  }
  totalRowChan.height = 22;

  // =========================================================================
  // TABLE 3: 📅 MONTH & CHANNEL-WISE SALES & PURCHASE DETAILED BREAKDOWN
  // =========================================================================
  summaryRow += 3;
  wsSummary.mergeCells(`A${summaryRow}:K${summaryRow}`);
  const mcSecTitle = wsSummary.getCell(`A${summaryRow}`);
  mcSecTitle.value = '📅 MONTH & CHANNEL-WISE SALES & PURCHASE DETAILED BREAKDOWN';
  mcSecTitle.font = { name: 'Arial', size: 11, bold: true, color: { argb: THEME.white } };
  mcSecTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3730A3' } };
  mcSecTitle.alignment = { vertical: 'middle', indent: 1 };
  wsSummary.getRow(summaryRow).height = 24;
  summaryRow++;

  const mcHeaders = [
    'Month',
    'Channel / Platform',
    'Gross Sales (₹)',
    'Sales Returns (₹)',
    'Net Sales (₹)',
    'Gross Purchases (₹)',
    'Vendor Credits (₹)',
    'Net Purchases (₹)',
    'Gross Profit (₹)',
    'Margin (%)',
    'Sales Share (%)',
  ];

  const headRowMC = wsSummary.getRow(summaryRow);
  mcHeaders.forEach((h, idx) => {
    const cell = headRowMC.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerDark } };
    cell.alignment = { horizontal: idx <= 1 ? 'left' : 'right', vertical: 'middle' };
    cell.border = thinBorder;
  });
  headRowMC.height = 24;
  summaryRow++;

  const mcStartRow = summaryRow;
  sortedMonthChannelList.forEach((item, idx) => {
    const gp = item.netSales - item.netPurchases;
    const margin = item.netSales > 0 ? (gp / item.netSales) * 100 : 0;
    const share = netSales > 0 ? (item.netSales / netSales) * 100 : 0;
    const row = wsSummary.getRow(summaryRow);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;

    row.getCell(1).value = item.month;
    row.getCell(2).value = item.channel;
    row.getCell(3).value = item.grossSales;
    row.getCell(4).value = item.salesReturns;
    row.getCell(5).value = { formula: `C${summaryRow}-D${summaryRow}`, result: item.netSales };
    row.getCell(6).value = item.grossPurchases;
    row.getCell(7).value = item.vendorCredits;
    row.getCell(8).value = { formula: `F${summaryRow}-G${summaryRow}`, result: item.netPurchases };
    row.getCell(9).value = { formula: `E${summaryRow}-H${summaryRow}`, result: gp };
    row.getCell(10).value = { formula: `IF(E${summaryRow}<>0, I${summaryRow}/E${summaryRow}, 0)`, result: margin / 100 };
    row.getCell(11).value = { formula: `IF(D$${rowCount1}<>0, E${summaryRow}/D$${rowCount1}, 0)`, result: share / 100 };

    for (let c = 1; c <= 11; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 9, bold: c === 1 || c === 2 || c === 5 || c === 8 || c === 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c <= 2 ? 'left' : 'right', vertical: 'middle' };
      if (c >= 3 && c <= 9) {
        cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      }
      if (c >= 10 && c <= 11) {
        cell.numFmt = '0.00%';
      }
      if (c === 9) {
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: gp >= 0 ? THEME.accentGreen : THEME.headerPurchase } };
      }
    }
    row.height = 20;
    summaryRow++;
  });

  const mcEndRow = summaryRow - 1;
  // Total row for Month & Channel Table
  const totalRowMC = wsSummary.getRow(summaryRow);
  totalRowMC.getCell(1).value = 'TOTAL CONSOLIDATED';
  totalRowMC.getCell(2).value = '-';
  if (sortedMonthChannelList.length > 0) {
    totalRowMC.getCell(3).value = { formula: `SUM(C${mcStartRow}:C${mcEndRow})`, result: totalGrossSales };
    totalRowMC.getCell(4).value = { formula: `SUM(D${mcStartRow}:D${mcEndRow})`, result: totalSalesReturns };
    totalRowMC.getCell(5).value = { formula: `C${summaryRow}-D${summaryRow}`, result: netSales };
    totalRowMC.getCell(6).value = { formula: `SUM(F${mcStartRow}:F${mcEndRow})`, result: totalGrossPurchases };
    totalRowMC.getCell(7).value = { formula: `SUM(G${mcStartRow}:G${mcEndRow})`, result: totalVendorCredits };
    totalRowMC.getCell(8).value = { formula: `F${summaryRow}-G${summaryRow}`, result: netPurchases };
    totalRowMC.getCell(9).value = { formula: `E${summaryRow}-H${summaryRow}`, result: grossProfit };
    totalRowMC.getCell(10).value = { formula: `IF(E${summaryRow}<>0, I${summaryRow}/E${summaryRow}, 0)`, result: (netSales > 0 ? (grossProfit / netSales) : 0) };
    totalRowMC.getCell(11).value = { formula: `SUM(K${mcStartRow}:K${mcEndRow})`, result: 1 };
  } else {
    totalRowMC.getCell(3).value = totalGrossSales;
    totalRowMC.getCell(4).value = totalSalesReturns;
    totalRowMC.getCell(5).value = netSales;
    totalRowMC.getCell(6).value = totalGrossPurchases;
    totalRowMC.getCell(7).value = totalVendorCredits;
    totalRowMC.getCell(8).value = netPurchases;
    totalRowMC.getCell(9).value = grossProfit;
    totalRowMC.getCell(10).value = netSales > 0 ? grossProfit / netSales : 0;
    totalRowMC.getCell(11).value = 1;
  }

  for (let c = 1; c <= 11; c++) {
    const cell = totalRowMC.getCell(c);
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c <= 2 ? 'left' : 'right', vertical: 'middle' };
    if (c >= 3 && c <= 9) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c >= 10 && c <= 11) cell.numFmt = '0.00%';
  }
  totalRowMC.height = 22;

  wsSummary.columns = [
    { width: 18 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 18 },
    { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ];
  }

  // =========================================================================
  // SHEET 2: 💰 SALES SUMMARY (PURE SALES & TRANSACTIONS)
  // =========================================================================
  if (includeSales) {
    const wsSales = workbook.addWorksheet('💰 Sales Summary', {
      views: [{ showGridLines: false }],
      properties: { tabColor: { argb: THEME.headerSales } },
    });

  wsSales.mergeCells('A1:K1');
  const salesHeaderCell = wsSales.getCell('A1');
  salesHeaderCell.value = 'SALES PERFORMANCE, CHANNEL & MONTHLY SUMMARY & TRANSACTION REGISTER';
  salesHeaderCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: THEME.white } };
  salesHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerSales } };
  salesHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSales.getRow(1).height = 36;

  addKpiCard(wsSales, 'A', 'B', '💰 TOTAL GROSS SALES', totalGrossSales, `${salesInvoicesCount} Invoices Processed`, THEME.cardBg2, THEME.headerSales);
  addKpiCard(wsSales, 'C', 'D', '↩️ TOTAL SALES RETURNS', totalSalesReturns, `${salesReturnsCount} Credit Notes Issued`, THEME.cardBg3, THEME.headerPurchase);
  addKpiCard(wsSales, 'E', 'F', '💵 NET SALES REVENUE', netSales, `Return Ratio: ${totalGrossSales > 0 ? ((totalSalesReturns / totalGrossSales) * 100).toFixed(2) : 0}%`, THEME.cardBg1, THEME.accentGreen);
  addKpiCard(wsSales, 'G', 'I', '📦 TOTAL TRANSACTIONS', salesInvoicesCount + salesReturnsCount, `Avg ₹${salesInvoicesCount + salesReturnsCount > 0 ? Math.round(netSales / (salesInvoicesCount + salesReturnsCount)).toLocaleString('en-IN') : 0} / Txn`, THEME.cardBg4, THEME.headerDark);
  addKpiCard(wsSales, 'J', 'K', '🏢 ACTIVE CHANNELS', Object.keys(salesChannelMap).length, `Sales Outlets / Platforms`, THEME.cardBg5, THEME.headerDark);

  wsSales.getRow(4).height = 18;
  wsSales.getRow(5).height = 24;
  wsSales.getRow(6).height = 18;

  let sRow = 8;

  // 1. Channel Table
  wsSales.mergeCells(`A${sRow}:H${sRow}`);
  const salesSec1 = wsSales.getCell(`A${sRow}`);
  salesSec1.value = '🛒 SALES CHANNEL-WISE BREAKDOWN';
  salesSec1.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
  salesSec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0369A1' } };
  salesSec1.alignment = { vertical: 'middle', indent: 1 };
  wsSales.getRow(sRow).height = 22;
  sRow++;

  const salesChanHeaders = ['Channel', 'Invoices Count', 'Returns Count', 'Gross Sales (₹)', 'Sales Returns (₹)', 'Net Sales (₹)', 'Return %', 'Share of Total %'];
  const sChanHeadRow = wsSales.getRow(sRow);
  salesChanHeaders.forEach((h, idx) => {
    const cell = sChanHeadRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx >= 3 ? 'right' : idx >= 1 ? 'center' : 'left', vertical: 'middle' };
    cell.border = thinBorder;
  });
  sChanHeadRow.height = 20;
  sRow++;

  const sortedSalesChannels = Object.entries(salesChannelMap).sort((a, b) => b[1].net - a[1].net);
  const sChanStart = sRow;
  const sTotRowIdx = sChanStart + sortedSalesChannels.length;

  sortedSalesChannels.forEach(([ch, d], idx) => {
    const row = wsSales.getRow(sRow);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
    const retPct = d.gross > 0 ? (d.returns / d.gross) * 100 : 0;
    const sharePct = netSales > 0 ? (d.net / netSales) * 100 : 0;
    const curR = sRow;

    row.getCell(1).value = ch;
    row.getCell(2).value = d.invCount;
    row.getCell(3).value = d.retCount;
    row.getCell(4).value = d.gross;
    row.getCell(5).value = d.returns;
    row.getCell(6).value = { formula: `D${curR}-E${curR}`, result: d.net };
    row.getCell(7).value = { formula: `IF(D${curR}<>0, E${curR}/D${curR}, 0)`, result: retPct / 100 };
    row.getCell(8).value = { formula: `IF($F$${sTotRowIdx}<>0, F${curR}/$F$${sTotRowIdx}, 0)`, result: sharePct / 100 };

    for (let c = 1; c <= 8; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 6 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c >= 4 ? 'right' : c >= 2 ? 'center' : 'left', vertical: 'middle' };
      if (c >= 4 && c <= 6) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      if (c === 7 || c === 8) cell.numFmt = '0.00%';
    }
    row.height = 18;
    sRow++;
  });

  const sChanEnd = sRow - 1;

  // Sales Channel Total Row
  const sTotRow = wsSales.getRow(sRow);
  sTotRow.getCell(1).value = 'TOTAL';
  if (sortedSalesChannels.length > 0) {
    sTotRow.getCell(2).value = { formula: `SUM(B${sChanStart}:B${sChanEnd})`, result: salesInvoicesCount };
    sTotRow.getCell(3).value = { formula: `SUM(C${sChanStart}:C${sChanEnd})`, result: salesReturnsCount };
    sTotRow.getCell(4).value = { formula: `SUM(D${sChanStart}:D${sChanEnd})`, result: totalGrossSales };
    sTotRow.getCell(5).value = { formula: `SUM(E${sChanStart}:E${sChanEnd})`, result: totalSalesReturns };
    sTotRow.getCell(6).value = { formula: `D${sTotRowIdx}-E${sTotRowIdx}`, result: netSales };
    sTotRow.getCell(7).value = { formula: `IF(D${sTotRowIdx}<>0, E${sTotRowIdx}/D${sTotRowIdx}, 0)`, result: (totalGrossSales > 0 ? totalSalesReturns / totalGrossSales : 0) };
    sTotRow.getCell(8).value = { formula: `SUM(H${sChanStart}:H${sChanEnd})`, result: 1.0 };
  } else {
    sTotRow.getCell(2).value = salesInvoicesCount;
    sTotRow.getCell(3).value = salesReturnsCount;
    sTotRow.getCell(4).value = totalGrossSales;
    sTotRow.getCell(5).value = totalSalesReturns;
    sTotRow.getCell(6).value = netSales;
    sTotRow.getCell(7).value = totalGrossSales > 0 ? (totalSalesReturns / totalGrossSales) : 0;
    sTotRow.getCell(8).value = 1.0;
  }

  for (let c = 1; c <= 8; c++) {
    const cell = sTotRow.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c >= 4 ? 'right' : c >= 2 ? 'center' : 'left', vertical: 'middle' };
    if (c >= 4 && c <= 6) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 7 || c === 8) cell.numFmt = '0.00%';
  }
  sTotRow.height = 20;
  sRow += 2;

  // 2. Month Table
  wsSales.mergeCells(`A${sRow}:H${sRow}`);
  const salesMonthSec = wsSales.getCell(`A${sRow}`);
  salesMonthSec.value = '📅 MONTH-WISE SALES BREAKDOWN';
  salesMonthSec.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
  salesMonthSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '075985' } };
  salesMonthSec.alignment = { vertical: 'middle', indent: 1 };
  wsSales.getRow(sRow).height = 22;
  sRow++;

  const sMonthHeadRow = wsSales.getRow(sRow);
  ['Month', 'Invoices Count', 'Returns Count', 'Gross Sales (₹)', 'Sales Returns (₹)', 'Net Sales (₹)', 'Return %', 'Share of Total %'].forEach((h, idx) => {
    const cell = sMonthHeadRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx >= 3 ? 'right' : idx >= 1 ? 'center' : 'left', vertical: 'middle' };
    cell.border = thinBorder;
  });
  sMonthHeadRow.height = 20;
  sRow++;

  const sMonthStart = sRow;
  const sMonthTotRowIdx = sMonthStart + sortedMonths.length;

  sortedMonths.forEach((m, idx) => {
    const d = salesMonthMap[m] || { gross: 0, returns: 0, net: 0, invCount: 0, retCount: 0 };
    const row = wsSales.getRow(sRow);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
    const retPct = d.gross > 0 ? (d.returns / d.gross) * 100 : 0;
    const sharePct = netSales > 0 ? (d.net / netSales) * 100 : 0;
    const curR = sRow;

    row.getCell(1).value = m;
    row.getCell(2).value = d.invCount;
    row.getCell(3).value = d.retCount;
    row.getCell(4).value = d.gross;
    row.getCell(5).value = d.returns;
    row.getCell(6).value = { formula: `D${curR}-E${curR}`, result: d.net };
    row.getCell(7).value = { formula: `IF(D${curR}<>0, E${curR}/D${curR}, 0)`, result: retPct / 100 };
    row.getCell(8).value = { formula: `IF($F$${sMonthTotRowIdx}<>0, F${curR}/$F$${sMonthTotRowIdx}, 0)`, result: sharePct / 100 };

    for (let c = 1; c <= 8; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 6 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c >= 4 ? 'right' : c >= 2 ? 'center' : 'left', vertical: 'middle' };
      if (c >= 4 && c <= 6) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      if (c === 7 || c === 8) cell.numFmt = '0.00%';
    }
    row.height = 18;
    sRow++;
  });

  const sMonthEnd = sRow - 1;

  // Month Total Row
  const sMonthTotRow = wsSales.getRow(sRow);
  sMonthTotRow.getCell(1).value = 'TOTAL';
  if (sortedMonths.length > 0) {
    sMonthTotRow.getCell(2).value = { formula: `SUM(B${sMonthStart}:B${sMonthEnd})`, result: salesInvoicesCount };
    sMonthTotRow.getCell(3).value = { formula: `SUM(C${sMonthStart}:C${sMonthEnd})`, result: salesReturnsCount };
    sMonthTotRow.getCell(4).value = { formula: `SUM(D${sMonthStart}:D${sMonthEnd})`, result: totalGrossSales };
    sMonthTotRow.getCell(5).value = { formula: `SUM(E${sMonthStart}:E${sMonthEnd})`, result: totalSalesReturns };
    sMonthTotRow.getCell(6).value = { formula: `D${sMonthTotRowIdx}-E${sMonthTotRowIdx}`, result: netSales };
    sMonthTotRow.getCell(7).value = { formula: `IF(D${sMonthTotRowIdx}<>0, E${sMonthTotRowIdx}/D${sMonthTotRowIdx}, 0)`, result: (totalGrossSales > 0 ? totalSalesReturns / totalGrossSales : 0) };
    sMonthTotRow.getCell(8).value = { formula: `SUM(H${sMonthStart}:H${sMonthEnd})`, result: 1.0 };
  } else {
    sMonthTotRow.getCell(2).value = salesInvoicesCount;
    sMonthTotRow.getCell(3).value = salesReturnsCount;
    sMonthTotRow.getCell(4).value = totalGrossSales;
    sMonthTotRow.getCell(5).value = totalSalesReturns;
    sMonthTotRow.getCell(6).value = netSales;
    sMonthTotRow.getCell(7).value = totalGrossSales > 0 ? (totalSalesReturns / totalGrossSales) : 0;
    sMonthTotRow.getCell(8).value = 1.0;
  }

  for (let c = 1; c <= 8; c++) {
    const cell = sMonthTotRow.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c >= 4 ? 'right' : c >= 2 ? 'center' : 'left', vertical: 'middle' };
    if (c >= 4 && c <= 6) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 7 || c === 8) cell.numFmt = '0.00%';
  }
  sMonthTotRow.height = 20;
  sRow += 2;

  // 3. Customer / Party Sales Performance Table
  wsSales.mergeCells(`A${sRow}:H${sRow}`);
  const sCustSec = wsSales.getCell(`A${sRow}`);
  sCustSec.value = `👥 CUSTOMER / PARTY SALES PERFORMANCE (${sortedSalesCustomers.length} Customers)`;
  sCustSec.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
  sCustSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F766E' } };
  sCustSec.alignment = { vertical: 'middle', indent: 1 };
  wsSales.getRow(sRow).height = 22;
  sRow++;

  const sCustHeaders = ['#', 'Customer / Party Name', 'Invoices Count', 'Returns Count', 'Gross Sales (₹)', 'Sales Returns (₹)', 'Net Sales (₹)', 'Share %'];
  const sCustHeadRow = wsSales.getRow(sRow);
  sCustHeaders.forEach((h, idx) => {
    const cell = sCustHeadRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx >= 4 ? 'right' : idx === 2 || idx === 3 || idx === 0 ? 'center' : 'left', vertical: 'middle' };
    cell.border = thinBorder;
  });
  sCustHeadRow.height = 20;
  sRow++;

  const sCustStart = sRow;
  const sCustTotRowIdx = sCustStart + sortedSalesCustomers.length;

  sortedSalesCustomers.forEach((cust, idx) => {
    const row = wsSales.getRow(sRow);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
    const sharePct = netSales > 0 ? (cust.net / netSales) * 100 : 0;
    const curR = sRow;

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = cust.party;
    row.getCell(3).value = cust.invCount;
    row.getCell(4).value = cust.retCount;
    row.getCell(5).value = cust.gross;
    row.getCell(6).value = cust.returns;
    row.getCell(7).value = { formula: `E${curR}-F${curR}`, result: cust.net };
    row.getCell(8).value = { formula: `IF($G$${sCustTotRowIdx}<>0, G${curR}/$G$${sCustTotRowIdx}, 0)`, result: sharePct / 100 };

    for (let c = 1; c <= 8; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 8.5, bold: c === 2 || c === 7 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c >= 5 ? 'right' : c === 3 || c === 4 || c === 1 ? 'center' : 'left', vertical: 'middle' };
      if (c >= 5 && c <= 7) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      if (c === 8) cell.numFmt = '0.00%';
    }
    row.height = 18;
    sRow++;
  });

  const sCustEnd = sRow - 1;

  // Customer Total Row
  const sCustTotRow = wsSales.getRow(sRow);
  sCustTotRow.getCell(1).value = 'TOTAL';
  sCustTotRow.getCell(2).value = `${sortedSalesCustomers.length} Customers`;
  if (sortedSalesCustomers.length > 0) {
    sCustTotRow.getCell(3).value = { formula: `SUM(C${sCustStart}:C${sCustEnd})`, result: salesInvoicesCount };
    sCustTotRow.getCell(4).value = { formula: `SUM(D${sCustStart}:D${sCustEnd})`, result: salesReturnsCount };
    sCustTotRow.getCell(5).value = { formula: `SUM(E${sCustStart}:E${sCustEnd})`, result: totalGrossSales };
    sCustTotRow.getCell(6).value = { formula: `SUM(F${sCustStart}:F${sCustEnd})`, result: totalSalesReturns };
    sCustTotRow.getCell(7).value = { formula: `E${sCustTotRowIdx}-F${sCustTotRowIdx}`, result: netSales };
    sCustTotRow.getCell(8).value = { formula: `SUM(H${sCustStart}:H${sCustEnd})`, result: 1.0 };
  } else {
    sCustTotRow.getCell(3).value = salesInvoicesCount;
    sCustTotRow.getCell(4).value = salesReturnsCount;
    sCustTotRow.getCell(5).value = totalGrossSales;
    sCustTotRow.getCell(6).value = totalSalesReturns;
    sCustTotRow.getCell(7).value = netSales;
    sCustTotRow.getCell(8).value = 1.0;
  }

  for (let c = 1; c <= 8; c++) {
    const cell = sCustTotRow.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c >= 5 ? 'right' : c === 3 || c === 4 || c === 1 ? 'center' : 'left', vertical: 'middle' };
    if (c >= 5 && c <= 7) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 8) cell.numFmt = '0.00%';
  }
  sCustTotRow.height = 20;
  sRow += 2;

    // 4. Detailed Sales Transaction Register
    if (includeRegisters) {
      wsSales.mergeCells(`A${sRow}:K${sRow}`);
      const sRegSec = wsSales.getCell(`A${sRow}`);
      sRegSec.value = `📑 DETAILED SALES TRANSACTION REGISTER (${salesData.length} Records)`;
      sRegSec.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
      sRegSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '334155' } };
      sRegSec.alignment = { vertical: 'middle', indent: 1 };
      wsSales.getRow(sRow).height = 22;
      sRow++;

      const sRegHeaders = [
        '#',
        'Date',
        'Month',
        'Invoice / Ref #',
        'Customer / Party Name',
        'Channel',
        'Transaction Type',
        'Status',
        'Gross Sales (₹)',
        'Sales Returns (₹)',
        'Net Amount (₹)',
      ];

      const sRegHeadRow = wsSales.getRow(sRow);
      sRegHeaders.forEach((h, idx) => {
        const cell = sRegHeadRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
        cell.alignment = { horizontal: idx >= 8 ? 'right' : idx === 0 || idx === 7 ? 'center' : 'left', vertical: 'middle' };
        cell.border = thinBorder;
      });
      sRegHeadRow.height = 20;
      sRow++;

      const sRegStart = sRow;
      const sRegTotRowIdx = sRegStart + salesData.length;

      salesData.forEach((item, idx) => {
        const { isInvoice, isReturn, invVal, retVal } = classifySalesRecord(item);
        const row = wsSales.getRow(sRow);
        const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
        const curR = sRow;

        const partyName = String(
          item.Transaction_Details && item.Transaction_Details !== '-'
            ? item.Transaction_Details
            : item.Account_Name || item.Entity_Number || item.Channel || 'Unknown Customer'
        ).trim() || 'Unknown Customer';

        const statusVal = String(item.Document_Status || item.Status || item['Final Status'] || 'Completed').trim();

        row.getCell(1).value = idx + 1;
        row.getCell(2).value = item.Date || '-';
        row.getCell(3).value = item.Month || '-';
        row.getCell(4).value = item.Reference_Number || item.Entity_Number || '-';
        row.getCell(5).value = partyName;
        row.getCell(6).value = item.Channel || 'Direct';
        row.getCell(7).value = item.Transaction_Type || (isReturn ? 'Credit Note' : 'Invoice');
        row.getCell(8).value = statusVal;
        row.getCell(9).value = invVal;
        row.getCell(10).value = retVal;
        row.getCell(11).value = { formula: `I${curR}-J${curR}`, result: invVal - retVal };

        for (let c = 1; c <= 11; c++) {
          const cell = row.getCell(c);
          cell.font = { name: 'Arial', size: 8.5, bold: c === 5 || c === 11 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.border = thinBorder;
          cell.alignment = { horizontal: c >= 9 ? 'right' : c === 1 || c === 8 ? 'center' : 'left', vertical: 'middle' };
          if (c >= 9 && c <= 11) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
        }
        row.height = 18;
        sRow++;
      });

      const sRegEnd = sRow - 1;

      // Sales Register Total Row
      const sRegTotRow = wsSales.getRow(sRow);
      sRegTotRow.getCell(1).value = 'TOTAL';
      sRegTotRow.getCell(5).value = `${salesData.length} Transactions`;
      if (salesData.length > 0) {
        sRegTotRow.getCell(9).value = { formula: `SUM(I${sRegStart}:I${sRegEnd})`, result: totalGrossSales };
        sRegTotRow.getCell(10).value = { formula: `SUM(J${sRegStart}:J${sRegEnd})`, result: totalSalesReturns };
        sRegTotRow.getCell(11).value = { formula: `I${sRegTotRowIdx}-J${sRegTotRowIdx}`, result: netSales };
      } else {
        sRegTotRow.getCell(9).value = 0;
        sRegTotRow.getCell(10).value = 0;
        sRegTotRow.getCell(11).value = 0;
      }

      for (let c = 1; c <= 11; c++) {
        const cell = sRegTotRow.getCell(c);
        cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
        cell.border = totalBorder;
        cell.alignment = { horizontal: c >= 9 ? 'right' : 'left', vertical: 'middle' };
        if (c >= 9 && c <= 11) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      }
      sRegTotRow.height = 20;
    }

    wsSales.columns = [
      { width: 6 },  // # / Col 1
      { width: 14 }, // Date / Col 2
      { width: 12 }, // Month / Col 3
      { width: 18 }, // Invoice / Ref # / Col 4
      { width: 28 }, // Customer Name / Col 5
      { width: 16 }, // Channel / Col 6
      { width: 18 }, // Transaction Type / Col 7
      { width: 14 }, // Status / Col 8
      { width: 18 }, // Gross Sales / Col 9
      { width: 18 }, // Sales Returns / Col 10
      { width: 20 }, // Net Sales / Col 11
    ];
  }

  // =========================================================================
  // SHEET 3: 🛒 PURCHASE SUMMARY (PURE PURCHASES & TRANSACTIONS)
  // =========================================================================
  if (includePurchase) {
    const wsPur = workbook.addWorksheet('🛒 Purchase Summary', {
      views: [{ showGridLines: false }],
      properties: { tabColor: { argb: THEME.headerPurchase } },
    });

  wsPur.mergeCells('A1:K1');
  const purHeaderCell = wsPur.getCell('A1');
  purHeaderCell.value = 'PURCHASE PERFORMANCE, PROCUREMENT BREAKDOWN & TRANSACTION REGISTER';
  purHeaderCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: THEME.white } };
  purHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerPurchase } };
  purHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsPur.getRow(1).height = 36;

  addKpiCard(wsPur, 'A', 'B', '🛒 TOTAL GROSS PURCHASES', totalGrossPurchases, `${purchaseBillsCount} Bills Received`, THEME.cardBg3, THEME.headerPurchase);
  addKpiCard(wsPur, 'C', 'D', '↩️ TOTAL VENDOR CREDITS', totalVendorCredits, `${purchaseCreditsCount} Credits Received`, THEME.cardBg1, THEME.accentGreen);
  addKpiCard(wsPur, 'E', 'F', '💵 NET PURCHASES (COGS)', netPurchases, `Credit Ratio: ${totalGrossPurchases > 0 ? ((totalVendorCredits / totalGrossPurchases) * 100).toFixed(2) : 0}%`, THEME.cardBg2, THEME.headerDark);
  addKpiCard(wsPur, 'G', 'I', '📦 TOTAL BILLS & CREDITS', purchaseBillsCount + purchaseCreditsCount, `Avg ₹${purchaseBillsCount + purchaseCreditsCount > 0 ? Math.round(netPurchases / (purchaseBillsCount + purchaseCreditsCount)).toLocaleString('en-IN') : 0} / Txn`, THEME.cardBg4, THEME.headerDark);
  addKpiCard(wsPur, 'J', 'K', '🏢 ACTIVE VENDORS', sortedPurchaseVendors.length, `Suppliers / Vendors`, THEME.cardBg5, THEME.headerDark);

  wsPur.getRow(4).height = 18;
  wsPur.getRow(5).height = 24;
  wsPur.getRow(6).height = 18;

  let pRow = 8;

  // 1. Purchase Channel & Category Table
  wsPur.mergeCells(`A${pRow}:H${pRow}`);
  const purSec1 = wsPur.getCell(`A${pRow}`);
  purSec1.value = '🛒 PURCHASE CHANNEL & CATEGORY BREAKDOWN';
  purSec1.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
  purSec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B91C1C' } };
  purSec1.alignment = { vertical: 'middle', indent: 1 };
  wsPur.getRow(pRow).height = 22;
  pRow++;

  const purChanHeaders = ['Channel', 'Bills Count', 'Credits Count', 'Gross Purchases (₹)', 'Vendor Credits (₹)', 'Net Purchases (₹)', 'Credit %', 'Share of Total %'];
  const pChanHeadRow = wsPur.getRow(pRow);
  purChanHeaders.forEach((h, idx) => {
    const cell = pChanHeadRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx >= 3 ? 'right' : idx >= 1 ? 'center' : 'left', vertical: 'middle' };
    cell.border = thinBorder;
  });
  pChanHeadRow.height = 20;
  pRow++;

  const sortedPurChannels = Object.entries(purchaseChannelMap).sort((a, b) => b[1].net - a[1].net);
  const pChanStart = pRow;
  const pTotRowIdx = pChanStart + sortedPurChannels.length;

  sortedPurChannels.forEach(([ch, d], idx) => {
    const row = wsPur.getRow(pRow);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
    const credPct = d.gross > 0 ? (d.credits / d.gross) * 100 : 0;
    const sharePct = netPurchases > 0 ? (d.net / netPurchases) * 100 : 0;
    const curR = pRow;

    row.getCell(1).value = ch;
    row.getCell(2).value = d.billCount;
    row.getCell(3).value = d.credCount;
    row.getCell(4).value = d.gross;
    row.getCell(5).value = d.credits;
    row.getCell(6).value = { formula: `D${curR}-E${curR}`, result: d.net };
    row.getCell(7).value = { formula: `IF(D${curR}<>0, E${curR}/D${curR}, 0)`, result: credPct / 100 };
    row.getCell(8).value = { formula: `IF($F$${pTotRowIdx}<>0, F${curR}/$F$${pTotRowIdx}, 0)`, result: sharePct / 100 };

    for (let c = 1; c <= 8; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 6 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c >= 4 ? 'right' : c >= 2 ? 'center' : 'left', vertical: 'middle' };
      if (c >= 4 && c <= 6) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      if (c === 7 || c === 8) cell.numFmt = '0.00%';
    }
    row.height = 18;
    pRow++;
  });

  const pChanEnd = pRow - 1;

  // Purchase Channel Total Row
  const pTotRow = wsPur.getRow(pRow);
  pTotRow.getCell(1).value = 'TOTAL';
  if (sortedPurChannels.length > 0) {
    pTotRow.getCell(2).value = { formula: `SUM(B${pChanStart}:B${pChanEnd})`, result: purchaseBillsCount };
    pTotRow.getCell(3).value = { formula: `SUM(C${pChanStart}:C${pChanEnd})`, result: purchaseCreditsCount };
    pTotRow.getCell(4).value = { formula: `SUM(D${pChanStart}:D${pChanEnd})`, result: totalGrossPurchases };
    pTotRow.getCell(5).value = { formula: `SUM(E${pChanStart}:E${pChanEnd})`, result: totalVendorCredits };
    pTotRow.getCell(6).value = { formula: `D${pTotRowIdx}-E${pTotRowIdx}`, result: netPurchases };
    pTotRow.getCell(7).value = { formula: `IF(D${pTotRowIdx}<>0, E${pTotRowIdx}/D${pTotRowIdx}, 0)`, result: (totalGrossPurchases > 0 ? totalVendorCredits / totalGrossPurchases : 0) };
    pTotRow.getCell(8).value = { formula: `SUM(H${pChanStart}:H${pChanEnd})`, result: 1.0 };
  } else {
    pTotRow.getCell(2).value = purchaseBillsCount;
    pTotRow.getCell(3).value = purchaseCreditsCount;
    pTotRow.getCell(4).value = totalGrossPurchases;
    pTotRow.getCell(5).value = totalVendorCredits;
    pTotRow.getCell(6).value = netPurchases;
    pTotRow.getCell(7).value = totalGrossPurchases > 0 ? (totalVendorCredits / totalGrossPurchases) : 0;
    pTotRow.getCell(8).value = 1.0;
  }

  for (let c = 1; c <= 8; c++) {
    const cell = pTotRow.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c >= 4 ? 'right' : c >= 2 ? 'center' : 'left', vertical: 'middle' };
    if (c >= 4 && c <= 6) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 7 || c === 8) cell.numFmt = '0.00%';
  }
  pTotRow.height = 20;
  pRow += 2;

  // 2. Month Table
  wsPur.mergeCells(`A${pRow}:H${pRow}`);
  const purMonthSec = wsPur.getCell(`A${pRow}`);
  purMonthSec.value = '📅 MONTH-WISE PURCHASE BREAKDOWN';
  purMonthSec.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
  purMonthSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '991B1B' } };
  purMonthSec.alignment = { vertical: 'middle', indent: 1 };
  wsPur.getRow(pRow).height = 22;
  pRow++;

  const pMonthHeadRow = wsPur.getRow(pRow);
  ['Month', 'Bills Count', 'Credits Count', 'Gross Purchases (₹)', 'Vendor Credits (₹)', 'Net Purchases (₹)', 'Credit %', 'Share of Total %'].forEach((h, idx) => {
    const cell = pMonthHeadRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx >= 3 ? 'right' : idx >= 1 ? 'center' : 'left', vertical: 'middle' };
    cell.border = thinBorder;
  });
  pMonthHeadRow.height = 20;
  pRow++;

  const pMonthStart = pRow;
  const pMonthTotRowIdx = pMonthStart + sortedMonths.length;

  sortedMonths.forEach((m, idx) => {
    const d = purchaseMonthMap[m] || { gross: 0, credits: 0, net: 0, billCount: 0, credCount: 0 };
    const row = wsPur.getRow(pRow);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
    const credPct = d.gross > 0 ? (d.credits / d.gross) * 100 : 0;
    const sharePct = netPurchases > 0 ? (d.net / netPurchases) * 100 : 0;
    const curR = pRow;

    row.getCell(1).value = m;
    row.getCell(2).value = d.billCount;
    row.getCell(3).value = d.credCount;
    row.getCell(4).value = d.gross;
    row.getCell(5).value = d.credits;
    row.getCell(6).value = { formula: `D${curR}-E${curR}`, result: d.net };
    row.getCell(7).value = { formula: `IF(D${curR}<>0, E${curR}/D${curR}, 0)`, result: credPct / 100 };
    row.getCell(8).value = { formula: `IF($F$${pMonthTotRowIdx}<>0, F${curR}/$F$${pMonthTotRowIdx}, 0)`, result: sharePct / 100 };

    for (let c = 1; c <= 8; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 6 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c >= 4 ? 'right' : c >= 2 ? 'center' : 'left', vertical: 'middle' };
      if (c >= 4 && c <= 6) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      if (c === 7 || c === 8) cell.numFmt = '0.00%';
    }
    row.height = 18;
    pRow++;
  });

  const pMonthEnd = pRow - 1;

  // Month Total Row
  const pMonthTotRow = wsPur.getRow(pRow);
  pMonthTotRow.getCell(1).value = 'TOTAL';
  if (sortedMonths.length > 0) {
    pMonthTotRow.getCell(2).value = { formula: `SUM(B${pMonthStart}:B${pMonthEnd})`, result: purchaseBillsCount };
    pMonthTotRow.getCell(3).value = { formula: `SUM(C${pMonthStart}:C${pMonthEnd})`, result: purchaseCreditsCount };
    pMonthTotRow.getCell(4).value = { formula: `SUM(D${pMonthStart}:D${pMonthEnd})`, result: totalGrossPurchases };
    pMonthTotRow.getCell(5).value = { formula: `SUM(E${pMonthStart}:E${pMonthEnd})`, result: totalVendorCredits };
    pMonthTotRow.getCell(6).value = { formula: `D${pMonthTotRowIdx}-E${pMonthTotRowIdx}`, result: netPurchases };
    pMonthTotRow.getCell(7).value = { formula: `IF(D${pMonthTotRowIdx}<>0, E${pMonthTotRowIdx}/D${pMonthTotRowIdx}, 0)`, result: (totalGrossPurchases > 0 ? totalVendorCredits / totalGrossPurchases : 0) };
    pMonthTotRow.getCell(8).value = { formula: `SUM(H${pMonthStart}:H${pMonthEnd})`, result: 1.0 };
  } else {
    pMonthTotRow.getCell(2).value = purchaseBillsCount;
    pMonthTotRow.getCell(3).value = purchaseCreditsCount;
    pMonthTotRow.getCell(4).value = totalGrossPurchases;
    pMonthTotRow.getCell(5).value = totalVendorCredits;
    pMonthTotRow.getCell(6).value = netPurchases;
    pMonthTotRow.getCell(7).value = totalGrossPurchases > 0 ? (totalVendorCredits / totalGrossPurchases) : 0;
    pMonthTotRow.getCell(8).value = 1.0;
  }

  for (let c = 1; c <= 8; c++) {
    const cell = pMonthTotRow.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c >= 4 ? 'right' : c >= 2 ? 'center' : 'left', vertical: 'middle' };
    if (c >= 4 && c <= 6) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 7 || c === 8) cell.numFmt = '0.00%';
  }
  pMonthTotRow.height = 20;
  pRow += 2;

  // 3. Vendor / Supplier Performance Table
  wsPur.mergeCells(`A${pRow}:H${pRow}`);
  const pVendorSec = wsPur.getCell(`A${pRow}`);
  pVendorSec.value = `👥 VENDOR / SUPPLIER PROCUREMENT PERFORMANCE (${sortedPurchaseVendors.length} Vendors)`;
  pVendorSec.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
  pVendorSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '7F1D1D' } };
  pVendorSec.alignment = { vertical: 'middle', indent: 1 };
  wsPur.getRow(pRow).height = 22;
  pRow++;

  const pVendorHeaders = ['#', 'Vendor / Supplier Name', 'Bills Count', 'Credits Count', 'Gross Purchases (₹)', 'Vendor Credits (₹)', 'Net Purchases (₹)', 'Share %'];
  const pVendorHeadRow = wsPur.getRow(pRow);
  pVendorHeaders.forEach((h, idx) => {
    const cell = pVendorHeadRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx >= 4 ? 'right' : idx === 2 || idx === 3 || idx === 0 ? 'center' : 'left', vertical: 'middle' };
    cell.border = thinBorder;
  });
  pVendorHeadRow.height = 20;
  pRow++;

  const pVendorStart = pRow;
  const pVendorTotRowIdx = pVendorStart + sortedPurchaseVendors.length;

  sortedPurchaseVendors.forEach((vnd, idx) => {
    const row = wsPur.getRow(pRow);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
    const sharePct = netPurchases > 0 ? (vnd.net / netPurchases) * 100 : 0;
    const curR = pRow;

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = vnd.vendor;
    row.getCell(3).value = vnd.billCount;
    row.getCell(4).value = vnd.credCount;
    row.getCell(5).value = vnd.gross;
    row.getCell(6).value = vnd.credits;
    row.getCell(7).value = { formula: `E${curR}-F${curR}`, result: vnd.net };
    row.getCell(8).value = { formula: `IF($G$${pVendorTotRowIdx}<>0, G${curR}/$G$${pVendorTotRowIdx}, 0)`, result: sharePct / 100 };

    for (let c = 1; c <= 8; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 8.5, bold: c === 2 || c === 7 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c >= 5 ? 'right' : c === 3 || c === 4 || c === 1 ? 'center' : 'left', vertical: 'middle' };
      if (c >= 5 && c <= 7) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      if (c === 8) cell.numFmt = '0.00%';
    }
    row.height = 18;
    pRow++;
  });

  const pVendorEnd = pRow - 1;

  // Vendor Total Row
  const pVendorTotRow = wsPur.getRow(pRow);
  pVendorTotRow.getCell(1).value = 'TOTAL';
  pVendorTotRow.getCell(2).value = `${sortedPurchaseVendors.length} Vendors`;
  if (sortedPurchaseVendors.length > 0) {
    pVendorTotRow.getCell(3).value = { formula: `SUM(C${pVendorStart}:C${pVendorEnd})`, result: purchaseBillsCount };
    pVendorTotRow.getCell(4).value = { formula: `SUM(D${pVendorStart}:D${pVendorEnd})`, result: purchaseCreditsCount };
    pVendorTotRow.getCell(5).value = { formula: `SUM(E${pVendorStart}:E${pVendorEnd})`, result: totalGrossPurchases };
    pVendorTotRow.getCell(6).value = { formula: `SUM(F${pVendorStart}:F${pVendorEnd})`, result: totalVendorCredits };
    pVendorTotRow.getCell(7).value = { formula: `E${pVendorTotRowIdx}-F${pVendorTotRowIdx}`, result: netPurchases };
    pVendorTotRow.getCell(8).value = { formula: `SUM(H${pVendorStart}:H${pVendorEnd})`, result: 1.0 };
  } else {
    pVendorTotRow.getCell(3).value = purchaseBillsCount;
    pVendorTotRow.getCell(4).value = purchaseCreditsCount;
    pVendorTotRow.getCell(5).value = totalGrossPurchases;
    pVendorTotRow.getCell(6).value = totalVendorCredits;
    pVendorTotRow.getCell(7).value = netPurchases;
    pVendorTotRow.getCell(8).value = 1.0;
  }

  for (let c = 1; c <= 8; c++) {
    const cell = pVendorTotRow.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c >= 5 ? 'right' : c === 3 || c === 4 || c === 1 ? 'center' : 'left', vertical: 'middle' };
    if (c >= 5 && c <= 7) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 8) cell.numFmt = '0.00%';
  }
  pVendorTotRow.height = 20;
  pRow += 2;

    // 4. Detailed Purchase Transaction Register
    if (includeRegisters) {
      wsPur.mergeCells(`A${pRow}:K${pRow}`);
      const pRegSec = wsPur.getCell(`A${pRow}`);
      pRegSec.value = `📑 DETAILED PURCHASE TRANSACTION REGISTER (${purchaseData.length} Records)`;
      pRegSec.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
      pRegSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '450A0A' } };
      pRegSec.alignment = { vertical: 'middle', indent: 1 };
      wsPur.getRow(pRow).height = 22;
      pRow++;

      const pRegHeaders = [
        '#',
        'Date',
        'Month',
        'Bill / Ref #',
        'Vendor / Supplier Name',
        'Channel',
        'Transaction Type',
        'Status',
        'Gross Bills (₹)',
        'Vendor Credits (₹)',
        'Net Amount (₹)',
      ];

      const pRegHeadRow = wsPur.getRow(pRow);
      pRegHeaders.forEach((h, idx) => {
        const cell = pRegHeadRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
        cell.alignment = { horizontal: idx >= 8 ? 'right' : idx === 0 || idx === 7 ? 'center' : 'left', vertical: 'middle' };
        cell.border = thinBorder;
      });
      pRegHeadRow.height = 20;
      pRow++;

      const pRegStart = pRow;
      const pRegTotRowIdx = pRegStart + purchaseData.length;

      purchaseData.forEach((item, idx) => {
        const { isBill, isCredit, billVal, creditVal } = classifyPurchaseRecord(item);
        const row = wsPur.getRow(pRow);
        const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
        const curR = pRow;

        const vendorName = String(
          item.Transaction_Details && item.Transaction_Details !== '-'
            ? item.Transaction_Details
            : item.Account_Name || item.Entity_Number || item.Channel || 'Unknown Vendor'
        ).trim() || 'Unknown Vendor';

        const statusVal = String(item.Document_Status || item.Status || item['Final Status'] || 'Completed').trim();

        row.getCell(1).value = idx + 1;
        row.getCell(2).value = item.Date || '-';
        row.getCell(3).value = item.Month || '-';
        row.getCell(4).value = item.Reference_Number || item.Entity_Number || '-';
        row.getCell(5).value = vendorName;
        row.getCell(6).value = item.Channel || 'Supplier';
        row.getCell(7).value = item.Transaction_Type || (isCredit ? 'Vendor Credit' : 'Bill');
        row.getCell(8).value = statusVal;
        row.getCell(9).value = billVal;
        row.getCell(10).value = creditVal;
        row.getCell(11).value = { formula: `I${curR}-J${curR}`, result: billVal - creditVal };

        for (let c = 1; c <= 11; c++) {
          const cell = row.getCell(c);
          cell.font = { name: 'Arial', size: 8.5, bold: c === 5 || c === 11 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.border = thinBorder;
          cell.alignment = { horizontal: c >= 9 ? 'right' : c === 1 || c === 8 ? 'center' : 'left', vertical: 'middle' };
          if (c >= 9 && c <= 11) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
        }
        row.height = 18;
        pRow++;
      });

      const pRegEnd = pRow - 1;

      // Purchase Register Total Row
      const pRegTotRow = wsPur.getRow(pRow);
      pRegTotRow.getCell(1).value = 'TOTAL';
      pRegTotRow.getCell(5).value = `${purchaseData.length} Transactions`;
      if (purchaseData.length > 0) {
        pRegTotRow.getCell(9).value = { formula: `SUM(I${pRegStart}:I${pRegEnd})`, result: totalGrossPurchases };
        pRegTotRow.getCell(10).value = { formula: `SUM(J${pRegStart}:J${pRegEnd})`, result: totalVendorCredits };
        pRegTotRow.getCell(11).value = { formula: `I${pRegTotRowIdx}-J${pRegTotRowIdx}`, result: netPurchases };
      } else {
        pRegTotRow.getCell(9).value = 0;
        pRegTotRow.getCell(10).value = 0;
        pRegTotRow.getCell(11).value = 0;
      }

      for (let c = 1; c <= 11; c++) {
        const cell = pRegTotRow.getCell(c);
        cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
        cell.border = totalBorder;
        cell.alignment = { horizontal: c >= 9 ? 'right' : 'left', vertical: 'middle' };
        if (c >= 9 && c <= 11) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      }
      pRegTotRow.height = 20;
    }

    wsPur.columns = [
      { width: 6 },  // # / Col 1
      { width: 14 }, // Date / Col 2
      { width: 12 }, // Month / Col 3
      { width: 18 }, // Bill / Ref # / Col 4
      { width: 28 }, // Vendor Name / Col 5
      { width: 16 }, // Channel / Col 6
      { width: 18 }, // Transaction Type / Col 7
      { width: 14 }, // Status / Col 8
      { width: 18 }, // Gross Bills / Col 9
      { width: 18 }, // Vendor Credits / Col 10
      { width: 20 }, // Net Purchases / Col 11
    ];
  }

  // =========================================================================
  // SHEET 4: 📋 EXPENSE SUMMARY (MARKETPLACE, TYPE, BRAND, MONTH & TRANSACTIONS)
  // =========================================================================
  if (includeExpense) {
    const wsExp = workbook.addWorksheet('📋 Expense Summary', {
      views: [{ showGridLines: false }],
      properties: { tabColor: { argb: THEME.headerExpense } },
    });

  wsExp.mergeCells('A1:I1');
  const expHeaderCell = wsExp.getCell('A1');
  expHeaderCell.value = 'MARKETPLACE & OPERATIONAL EXPENSES DASHBOARD SUMMARY';
  expHeaderCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: THEME.white } };
  expHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerExpense } };
  expHeaderCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsExp.getRow(1).height = 36;

  addKpiCard(wsExp, 'A', 'B', '📋 TOTAL GROSS EXPENSES', totalGrossExpenses, `${expenseData.length} Records Logged`, THEME.cardBg4, THEME.headerExpense);
  addKpiCard(wsExp, 'C', 'D', '↩️ TOTAL EXPENSE CREDITS', totalExpenseCredits, `Discounts / Waivers`, THEME.cardBg1, THEME.accentGreen);
  addKpiCard(wsExp, 'E', 'F', '💵 NET OPERATING EXPENSE', totalNetExpenses, `Expense % of Sales: ${netSales > 0 ? ((totalNetExpenses / netSales) * 100).toFixed(2) : 0}%`, THEME.cardBg3, THEME.headerPurchase);
  addKpiCard(wsExp, 'G', 'H', '🏷️ TYPES & BRANDS', `${sortedExpTypes.length} Types | ${sortedExpBrands.length} Brands`, `Active Categorizations`, THEME.cardBg2, THEME.headerDark);
  addKpiCard(wsExp, 'I', 'I', '🏢 PLATFORMS', sortedExpMarketplaces.length, `Marketplaces Tracked`, THEME.cardBg5, THEME.headerDark);

  wsExp.getRow(4).height = 18;
  wsExp.getRow(5).height = 24;
  wsExp.getRow(6).height = 18;

  let eRow = 8;

  // 1. Marketplace Table
  wsExp.mergeCells(`A${eRow}:G${eRow}`);
  const expSec1 = wsExp.getCell(`A${eRow}`);
  expSec1.value = '🛒 1. MARKETPLACE / PLATFORM-WISE BREAKDOWN';
  expSec1.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
  expSec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B45309' } };
  expSec1.alignment = { vertical: 'middle', indent: 1 };
  wsExp.getRow(eRow).height = 22;
  eRow++;

  const expChanHeaders = ['Marketplace / Platform', 'Records', 'Invoices Amount (₹)', 'Credit Notes (₹)', 'Net Expense (₹)', 'Share %', 'Expense % of Sales'];
  const eChanHeadRow = wsExp.getRow(eRow);
  expChanHeaders.forEach((h, idx) => {
    const cell = eChanHeadRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx >= 2 ? 'right' : idx === 1 ? 'center' : 'left', vertical: 'middle' };
    cell.border = thinBorder;
  });
  eChanHeadRow.height = 20;
  eRow++;

  const eChanStart = eRow;
  const eTotRowIdx = eChanStart + sortedExpMarketplaces.length;

  sortedExpMarketplaces.forEach((d, idx) => {
    const row = wsExp.getRow(eRow);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
    const sharePct = totalNetExpenses > 0 ? (d.net / totalNetExpenses) * 100 : 0;
    const salesPct = netSales > 0 ? (d.net / netSales) * 100 : 0;
    const curR = eRow;

    row.getCell(1).value = d.marketplace;
    row.getCell(2).value = d.count;
    row.getCell(3).value = d.invoice;
    row.getCell(4).value = d.credit;
    row.getCell(5).value = { formula: `C${curR}-D${curR}`, result: d.net };
    row.getCell(6).value = { formula: `IF($E$${eTotRowIdx}<>0, E${curR}/$E$${eTotRowIdx}, 0)`, result: sharePct / 100 };
    row.getCell(7).value = salesPct / 100;

    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 5 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c >= 3 ? 'right' : c === 2 ? 'center' : 'left', vertical: 'middle' };
      if (c >= 3 && c <= 5) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      if (c === 6 || c === 7) cell.numFmt = '0.00%';
    }
    row.height = 18;
    eRow++;
  });

  const eChanEnd = eRow - 1;

  // Marketplace Total Row
  const eTotRow = wsExp.getRow(eRow);
  eTotRow.getCell(1).value = 'TOTAL';
  if (sortedExpMarketplaces.length > 0) {
    eTotRow.getCell(2).value = { formula: `SUM(B${eChanStart}:B${eChanEnd})`, result: expenseData.length };
    eTotRow.getCell(3).value = { formula: `SUM(C${eChanStart}:C${eChanEnd})`, result: totalGrossExpenses };
    eTotRow.getCell(4).value = { formula: `SUM(D${eChanStart}:D${eChanEnd})`, result: totalExpenseCredits };
    eTotRow.getCell(5).value = { formula: `C${eTotRowIdx}-D${eTotRowIdx}`, result: totalNetExpenses };
    eTotRow.getCell(6).value = { formula: `SUM(F${eChanStart}:F${eChanEnd})`, result: 1.0 };
    eTotRow.getCell(7).value = netSales > 0 ? (totalNetExpenses / netSales) : 0;
  } else {
    eTotRow.getCell(2).value = expenseData.length;
    eTotRow.getCell(3).value = totalGrossExpenses;
    eTotRow.getCell(4).value = totalExpenseCredits;
    eTotRow.getCell(5).value = totalNetExpenses;
    eTotRow.getCell(6).value = 1.0;
    eTotRow.getCell(7).value = netSales > 0 ? (totalNetExpenses / netSales) : 0;
  }

  for (let c = 1; c <= 7; c++) {
    const cell = eTotRow.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c >= 3 ? 'right' : c === 2 ? 'center' : 'left', vertical: 'middle' };
    if (c >= 3 && c <= 5) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 6 || c === 7) cell.numFmt = '0.00%';
  }
  eTotRow.height = 20;
  eRow += 2;

  // 2. EXPENSE TYPE-WISE NET EXPENSE BREAKDOWN
  wsExp.mergeCells(`A${eRow}:G${eRow}`);
  const expTypeSec = wsExp.getCell(`A${eRow}`);
  expTypeSec.value = `🏷️ 2. EXPENSE TYPE-WISE NET EXPENSE BREAKDOWN (${sortedExpTypes.length} Expense Types)`;
  expTypeSec.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
  expTypeSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A8A' } };
  expTypeSec.alignment = { vertical: 'middle', indent: 1 };
  wsExp.getRow(eRow).height = 22;
  eRow++;

  const expTypeHeaders = ['Expense Type / Category', 'Records Count', 'Invoices Amount (₹)', 'Credit Notes (₹)', 'Net Expense (₹)', 'Share of Expenses %', 'Expense % of Sales'];
  const eTypeHeadRow = wsExp.getRow(eRow);
  expTypeHeaders.forEach((h, idx) => {
    const cell = eTypeHeadRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx >= 2 ? 'right' : idx === 1 ? 'center' : 'left', vertical: 'middle' };
    cell.border = thinBorder;
  });
  eTypeHeadRow.height = 20;
  eRow++;

  const eTypeStart = eRow;
  const eTypeTotRowIdx = eTypeStart + sortedExpTypes.length;

  sortedExpTypes.forEach((d, idx) => {
    const row = wsExp.getRow(eRow);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
    const sharePct = totalNetExpenses > 0 ? (d.net / totalNetExpenses) * 100 : 0;
    const salesPct = netSales > 0 ? (d.net / netSales) * 100 : 0;
    const curR = eRow;

    row.getCell(1).value = d.type;
    row.getCell(2).value = d.count;
    row.getCell(3).value = d.invoice;
    row.getCell(4).value = d.credit;
    row.getCell(5).value = { formula: `C${curR}-D${curR}`, result: d.net };
    row.getCell(6).value = { formula: `IF($E$${eTypeTotRowIdx}<>0, E${curR}/$E$${eTypeTotRowIdx}, 0)`, result: sharePct / 100 };
    row.getCell(7).value = salesPct / 100;

    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 5 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c >= 3 ? 'right' : c === 2 ? 'center' : 'left', vertical: 'middle' };
      if (c >= 3 && c <= 5) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      if (c === 6 || c === 7) cell.numFmt = '0.00%';
    }
    row.height = 18;
    eRow++;
  });

  const eTypeEnd = eRow - 1;

  // Expense Type Total Row
  const eTypeTotRow = wsExp.getRow(eRow);
  eTypeTotRow.getCell(1).value = 'TOTAL';
  if (sortedExpTypes.length > 0) {
    eTypeTotRow.getCell(2).value = { formula: `SUM(B${eTypeStart}:B${eTypeEnd})`, result: expenseData.length };
    eTypeTotRow.getCell(3).value = { formula: `SUM(C${eTypeStart}:C${eTypeEnd})`, result: totalGrossExpenses };
    eTypeTotRow.getCell(4).value = { formula: `SUM(D${eTypeStart}:D${eTypeEnd})`, result: totalExpenseCredits };
    eTypeTotRow.getCell(5).value = { formula: `C${eTypeTotRowIdx}-D${eTypeTotRowIdx}`, result: totalNetExpenses };
    eTypeTotRow.getCell(6).value = { formula: `SUM(F${eTypeStart}:F${eTypeEnd})`, result: 1.0 };
    eTypeTotRow.getCell(7).value = netSales > 0 ? (totalNetExpenses / netSales) : 0;
  } else {
    eTypeTotRow.getCell(2).value = expenseData.length;
    eTypeTotRow.getCell(3).value = totalGrossExpenses;
    eTypeTotRow.getCell(4).value = totalExpenseCredits;
    eTypeTotRow.getCell(5).value = totalNetExpenses;
    eTypeTotRow.getCell(6).value = 1.0;
    eTypeTotRow.getCell(7).value = netSales > 0 ? (totalNetExpenses / netSales) : 0;
  }

  for (let c = 1; c <= 7; c++) {
    const cell = eTypeTotRow.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c >= 3 ? 'right' : c === 2 ? 'center' : 'left', vertical: 'middle' };
    if (c >= 3 && c <= 5) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 6 || c === 7) cell.numFmt = '0.00%';
  }
  eTypeTotRow.height = 20;
  eRow += 2;

  // 3. BRAND-WISE NET EXPENSE BREAKDOWN
  wsExp.mergeCells(`A${eRow}:G${eRow}`);
  const expBrandSec = wsExp.getCell(`A${eRow}`);
  expBrandSec.value = `🏢 3. BRAND-WISE NET EXPENSE BREAKDOWN (${sortedExpBrands.length} Brands)`;
  expBrandSec.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
  expBrandSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F766E' } };
  expBrandSec.alignment = { vertical: 'middle', indent: 1 };
  wsExp.getRow(eRow).height = 22;
  eRow++;

  const expBrandHeaders = ['Brand Name', 'Records Count', 'Invoices Amount (₹)', 'Credit Notes (₹)', 'Net Expense (₹)', 'Share of Expenses %', 'Expense % of Sales'];
  const eBrandHeadRow = wsExp.getRow(eRow);
  expBrandHeaders.forEach((h, idx) => {
    const cell = eBrandHeadRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx >= 2 ? 'right' : idx === 1 ? 'center' : 'left', vertical: 'middle' };
    cell.border = thinBorder;
  });
  eBrandHeadRow.height = 20;
  eRow++;

  const eBrandStart = eRow;
  const eBrandTotRowIdx = eBrandStart + sortedExpBrands.length;

  sortedExpBrands.forEach((d, idx) => {
    const row = wsExp.getRow(eRow);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
    const sharePct = totalNetExpenses > 0 ? (d.net / totalNetExpenses) * 100 : 0;
    const salesPct = netSales > 0 ? (d.net / netSales) * 100 : 0;
    const curR = eRow;

    row.getCell(1).value = d.brand;
    row.getCell(2).value = d.count;
    row.getCell(3).value = d.invoice;
    row.getCell(4).value = d.credit;
    row.getCell(5).value = { formula: `C${curR}-D${curR}`, result: d.net };
    row.getCell(6).value = { formula: `IF($E$${eBrandTotRowIdx}<>0, E${curR}/$E$${eBrandTotRowIdx}, 0)`, result: sharePct / 100 };
    row.getCell(7).value = salesPct / 100;

    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 5 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c >= 3 ? 'right' : c === 2 ? 'center' : 'left', vertical: 'middle' };
      if (c >= 3 && c <= 5) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      if (c === 6 || c === 7) cell.numFmt = '0.00%';
    }
    row.height = 18;
    eRow++;
  });

  const eBrandEnd = eRow - 1;

  // Brand Total Row
  const eBrandTotRow = wsExp.getRow(eRow);
  eBrandTotRow.getCell(1).value = 'TOTAL';
  if (sortedExpBrands.length > 0) {
    eBrandTotRow.getCell(2).value = { formula: `SUM(B${eBrandStart}:B${eBrandEnd})`, result: expenseData.length };
    eBrandTotRow.getCell(3).value = { formula: `SUM(C${eBrandStart}:C${eBrandEnd})`, result: totalGrossExpenses };
    eBrandTotRow.getCell(4).value = { formula: `SUM(D${eBrandStart}:D${eBrandEnd})`, result: totalExpenseCredits };
    eBrandTotRow.getCell(5).value = { formula: `C${eBrandTotRowIdx}-D${eBrandTotRowIdx}`, result: totalNetExpenses };
    eBrandTotRow.getCell(6).value = { formula: `SUM(F${eBrandStart}:F${eBrandEnd})`, result: 1.0 };
    eBrandTotRow.getCell(7).value = netSales > 0 ? (totalNetExpenses / netSales) : 0;
  } else {
    eBrandTotRow.getCell(2).value = expenseData.length;
    eBrandTotRow.getCell(3).value = totalGrossExpenses;
    eBrandTotRow.getCell(4).value = totalExpenseCredits;
    eBrandTotRow.getCell(5).value = totalNetExpenses;
    eBrandTotRow.getCell(6).value = 1.0;
    eBrandTotRow.getCell(7).value = netSales > 0 ? (totalNetExpenses / netSales) : 0;
  }

  for (let c = 1; c <= 7; c++) {
    const cell = eBrandTotRow.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c >= 3 ? 'right' : c === 2 ? 'center' : 'left', vertical: 'middle' };
    if (c >= 3 && c <= 5) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 6 || c === 7) cell.numFmt = '0.00%';
  }
  eBrandTotRow.height = 20;
  eRow += 2;

  // 4. MONTH-WISE EXPENSE BREAKDOWN
  wsExp.mergeCells(`A${eRow}:G${eRow}`);
  const expMonthSec = wsExp.getCell(`A${eRow}`);
  expMonthSec.value = `📅 4. MONTH-WISE EXPENSE BREAKDOWN (${sortedExpMonths.length} Months)`;
  expMonthSec.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
  expMonthSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '075985' } };
  expMonthSec.alignment = { vertical: 'middle', indent: 1 };
  wsExp.getRow(eRow).height = 22;
  eRow++;

  const expMonthHeaders = ['Month', 'Records Count', 'Invoices Amount (₹)', 'Credit Notes (₹)', 'Net Expense (₹)', 'Share of Expenses %', 'Expense % of Sales'];
  const eMonthHeadRow = wsExp.getRow(eRow);
  expMonthHeaders.forEach((h, idx) => {
    const cell = eMonthHeadRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx >= 2 ? 'right' : idx === 1 ? 'center' : 'left', vertical: 'middle' };
    cell.border = thinBorder;
  });
  eMonthHeadRow.height = 20;
  eRow++;

  const eMonthStart = eRow;
  const eMonthTotRowIdx = eMonthStart + sortedExpMonths.length;

  sortedExpMonths.forEach((d, idx) => {
    const row = wsExp.getRow(eRow);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
    const sharePct = totalNetExpenses > 0 ? (d.net / totalNetExpenses) * 100 : 0;
    const salesPct = netSales > 0 ? (d.net / netSales) * 100 : 0;
    const curR = eRow;

    row.getCell(1).value = d.month;
    row.getCell(2).value = d.count;
    row.getCell(3).value = d.invoice;
    row.getCell(4).value = d.credit;
    row.getCell(5).value = { formula: `C${curR}-D${curR}`, result: d.net };
    row.getCell(6).value = { formula: `IF($E$${eMonthTotRowIdx}<>0, E${curR}/$E$${eMonthTotRowIdx}, 0)`, result: sharePct / 100 };
    row.getCell(7).value = salesPct / 100;

    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 5 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c >= 3 ? 'right' : c === 2 ? 'center' : 'left', vertical: 'middle' };
      if (c >= 3 && c <= 5) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      if (c === 6 || c === 7) cell.numFmt = '0.00%';
    }
    row.height = 18;
    eRow++;
  });

  const eMonthEnd = eRow - 1;

  // Month Total Row
  const eMonthTotRow = wsExp.getRow(eRow);
  eMonthTotRow.getCell(1).value = 'TOTAL';
  if (sortedExpMonths.length > 0) {
    eMonthTotRow.getCell(2).value = { formula: `SUM(B${eMonthStart}:B${eMonthEnd})`, result: expenseData.length };
    eMonthTotRow.getCell(3).value = { formula: `SUM(C${eMonthStart}:C${eMonthEnd})`, result: totalGrossExpenses };
    eMonthTotRow.getCell(4).value = { formula: `SUM(D${eMonthStart}:D${eMonthEnd})`, result: totalExpenseCredits };
    eMonthTotRow.getCell(5).value = { formula: `C${eMonthTotRowIdx}-D${eMonthTotRowIdx}`, result: totalNetExpenses };
    eMonthTotRow.getCell(6).value = { formula: `SUM(F${eMonthStart}:F${eMonthEnd})`, result: 1.0 };
    eMonthTotRow.getCell(7).value = netSales > 0 ? (totalNetExpenses / netSales) : 0;
  } else {
    eMonthTotRow.getCell(2).value = expenseData.length;
    eMonthTotRow.getCell(3).value = totalGrossExpenses;
    eMonthTotRow.getCell(4).value = totalExpenseCredits;
    eMonthTotRow.getCell(5).value = totalNetExpenses;
    eMonthTotRow.getCell(6).value = 1.0;
    eMonthTotRow.getCell(7).value = netSales > 0 ? (totalNetExpenses / netSales) : 0;
  }

  for (let c = 1; c <= 7; c++) {
    const cell = eMonthTotRow.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c >= 3 ? 'right' : c === 2 ? 'center' : 'left', vertical: 'middle' };
    if (c >= 3 && c <= 5) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 6 || c === 7) cell.numFmt = '0.00%';
  }
  eMonthTotRow.height = 20;
  eRow += 2;

    // 5. DETAILED EXPENSE TRANSACTION REGISTER
    if (includeRegisters) {
      wsExp.mergeCells(`A${eRow}:I${eRow}`);
      const expRegSec = wsExp.getCell(`A${eRow}`);
      expRegSec.value = `📑 5. DETAILED EXPENSE TRANSACTION REGISTER (${expenseData.length} Records)`;
      expRegSec.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
      expRegSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '334155' } };
      expRegSec.alignment = { vertical: 'middle', indent: 1 };
      wsExp.getRow(eRow).height = 22;
      eRow++;

      const expRegHeaders = [
        '#',
        'Month',
        'Marketplace / Platform',
        'Brand Name',
        'Expense Type / Category',
        'Invoice Number',
        'Invoice Value (₹)',
        'Credit Note (₹)',
        'Net Expense (₹)',
      ];

      const eRegHeadRow = wsExp.getRow(eRow);
      expRegHeaders.forEach((h, idx) => {
        const cell = eRegHeadRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
        cell.alignment = { horizontal: idx >= 6 ? 'right' : idx === 0 || idx === 1 ? 'center' : 'left', vertical: 'middle' };
        cell.border = thinBorder;
      });
      eRegHeadRow.height = 20;
      eRow++;

      const eRegStart = eRow;
      const eRegTotRowIdx = eRegStart + expenseData.length;

      expenseData.forEach((e, idx) => {
        const row = wsExp.getRow(eRow);
        const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
        const inv = parseNum(e.invoice);
        const cr = parseNum(e.credit);
        const curR = eRow;

        row.getCell(1).value = idx + 1;
        row.getCell(2).value = e.month || '-';
        row.getCell(3).value = e.marketplace || '-';
        row.getCell(4).value = e.name || 'General / Unbranded';
        row.getCell(5).value = e.desc || 'General Expense';
        row.getCell(6).value = e.invoiceNumber || '-';
        row.getCell(7).value = inv;
        row.getCell(8).value = cr;
        row.getCell(9).value = { formula: `G${curR}-H${curR}`, result: inv - cr };

        for (let c = 1; c <= 9; c++) {
          const cell = row.getCell(c);
          cell.font = { name: 'Arial', size: 8.5, bold: c === 4 || c === 5 || c === 9 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.border = thinBorder;
          cell.alignment = { horizontal: c >= 7 ? 'right' : c === 1 || c === 2 ? 'center' : 'left', vertical: 'middle' };
          if (c >= 7 && c <= 9) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
        }
        row.height = 18;
        eRow++;
      });

      const eRegEnd = eRow - 1;

      // Expense Register Total Row
      const eRegTotRow = wsExp.getRow(eRow);
      eRegTotRow.getCell(1).value = 'TOTAL';
      eRegTotRow.getCell(4).value = `${expenseData.length} Expense Records`;
      if (expenseData.length > 0) {
        eRegTotRow.getCell(7).value = { formula: `SUM(G${eRegStart}:G${eRegEnd})`, result: totalGrossExpenses };
        eRegTotRow.getCell(8).value = { formula: `SUM(H${eRegStart}:H${eRegEnd})`, result: totalExpenseCredits };
        eRegTotRow.getCell(9).value = { formula: `G${eRegTotRowIdx}-H${eRegTotRowIdx}`, result: totalNetExpenses };
      } else {
        eRegTotRow.getCell(7).value = 0;
        eRegTotRow.getCell(8).value = 0;
        eRegTotRow.getCell(9).value = 0;
      }

      for (let c = 1; c <= 9; c++) {
        const cell = eRegTotRow.getCell(c);
        cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
        cell.border = totalBorder;
        cell.alignment = { horizontal: c >= 7 ? 'right' : 'left', vertical: 'middle' };
        if (c >= 7 && c <= 9) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      }
      eRegTotRow.height = 20;
    }

    wsExp.columns = [
      { width: 30 }, // Col 1: Name / Title / #
      { width: 15 }, // Col 2: Month / Records
      { width: 22 }, // Col 3: Marketplace / Invoices Amount (₹)
      { width: 22 }, // Col 4: Brand / Credit Notes (₹)
      { width: 26 }, // Col 5: Expense Type / Net Expense (₹)
      { width: 20 }, // Col 6: Invoice # / Share %
      { width: 20 }, // Col 7: Invoice Value (₹) / Expense % of Sales
      { width: 18 }, // Col 8: Credit Note (₹)
      { width: 22 }, // Col 9: Net Expense (₹)
    ];
  }

  // =========================================================================
  // SHEET 5: ⏳ OUTSTANDING SUMMARY & PARTY/VENDOR AGING
  // =========================================================================
  if (includeOutstanding) {
    const wsOut = workbook.addWorksheet('⏳ Outstanding Summary', {
      views: [{ showGridLines: false }],
      properties: { tabColor: { argb: THEME.headerOutstanding } },
    });

  wsOut.mergeCells('A1:K1');
  const outTitle = wsOut.getCell('A1');
  outTitle.value = 'OUTSTANDING DASHBOARD SUMMARY, SETTLEMENT LIFECYCLE, AGING & TRANSACTION REGISTER';
  outTitle.font = { name: 'Arial', size: 14, bold: true, color: { argb: THEME.white } };
  outTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerOutstanding } };
  outTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  wsOut.getRow(1).height = 36;

  const finalSalesAdjustedVal = totalSalesOutstanding - totalNetExpenses - totalPaymentAmount;

  addKpiCard(wsOut, 'A', 'C', '💰 SALES RECEIVABLES', finalSalesAdjustedVal, `Adjusted (Sales Out - Net Exp - Payments)`, THEME.cardBg2, THEME.headerSales);
  addKpiCard(wsOut, 'E', 'G', '🛒 PURCHASE PAYABLES', totalPurchaseOutstanding, `Paid: ₹${purchasePaidVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })} | Closed: ₹${purchaseClosedVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, THEME.cardBg3, THEME.headerPurchase);
  addKpiCard(wsOut, 'I', 'K', '📉 NET EXPENSES & PAYMENTS', totalNetExpenses + totalPaymentAmount, `Expenses: ₹${totalNetExpenses.toLocaleString('en-IN', { maximumFractionDigits: 0 })} | Payments: ₹${totalPaymentAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, THEME.cardBg4, 'B45309');

  wsOut.getRow(4).height = 18;
  wsOut.getRow(5).height = 24;
  wsOut.getRow(6).height = 18;

  // 1. Complete Sales & Purchase Lifecycle, Returns & Settlement Summary (Rows 8-19)
  wsOut.mergeCells('A8:J8');
  const lifeSecTitle = wsOut.getCell('A8');
  lifeSecTitle.value = '📈 SALES & PURCHASE COMPLETE RECONCILIATION, RETURNS & SETTLEMENT LIFECYCLE';
  lifeSecTitle.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
  lifeSecTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '065F46' } };
  lifeSecTitle.alignment = { vertical: 'middle', indent: 1 };
  wsOut.getRow(8).height = 24;

  const lifeHeaders = [
    'Transaction Stream / Type',
    'Gross Billed (₹)',
    'Returns & Credits (₹)',
    'Net Document Value (₹)',
    'Paid Settled (₹)',
    'Closed / Adjusted (₹)',
    'Open Current (₹)',
    'Overdue Pending (₹)',
    'Net Outstanding (₹)',
    'Settled / Resolved %',
  ];
  const lifeHeadRow = wsOut.getRow(9);
  lifeHeaders.forEach((h, idx) => {
    const cell = lifeHeadRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx === 0 ? 'left' : 'right', vertical: 'middle' };
    cell.border = thinBorder;
  });
  lifeHeadRow.height = 22;

  // Row 10: Sales Invoices
  const sInvOut = salesInvoiceOpenVal + salesInvoiceOverdueVal;
  const sInvSettledRate = salesGrossInvoicesVal > 0 ? ((salesInvPaidVal + salesInvClosedVal) / salesGrossInvoicesVal) * 100 : 0;
  const r10 = wsOut.getRow(10);
  r10.getCell(1).value = '  ↳ Sales Invoices (Gross Sales)';
  r10.getCell(2).value = salesGrossInvoicesVal;
  r10.getCell(3).value = 0;
  r10.getCell(4).value = { formula: 'B10-C10', result: salesGrossInvoicesVal };
  r10.getCell(5).value = salesInvPaidVal;
  r10.getCell(6).value = salesInvClosedVal;
  r10.getCell(7).value = salesInvoiceOpenVal;
  r10.getCell(8).value = salesInvoiceOverdueVal;
  r10.getCell(9).value = { formula: 'G10+H10', result: sInvOut };
  r10.getCell(10).value = { formula: 'IF(B10<>0, (E10+F10)/B10, 0)', result: sInvSettledRate / 100 };
  for (let c = 1; c <= 10; c++) {
    const cell = r10.getCell(c);
    cell.font = { name: 'Arial', size: 8.5 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.white } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
    if (c >= 2 && c <= 9) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 10) cell.numFmt = '0.00%';
  }
  r10.height = 19;

  // Row 11: Sales Returns / Credit Notes
  const sRetOut = salesCreditNoteOpenVal + salesCreditNoteOverdueVal;
  const sRetSettledRate = salesReturnsVal > 0 ? ((salesRetPaidVal + salesRetClosedVal) / salesReturnsVal) * 100 : 0;
  const r11 = wsOut.getRow(11);
  r11.getCell(1).value = '  ↳ Sales Returns (Credit Notes)';
  r11.getCell(2).value = 0;
  r11.getCell(3).value = salesReturnsVal;
  r11.getCell(4).value = { formula: 'B11-C11', result: -salesReturnsVal };
  r11.getCell(5).value = salesRetPaidVal;
  r11.getCell(6).value = salesRetClosedVal;
  r11.getCell(7).value = salesCreditNoteOpenVal;
  r11.getCell(8).value = salesCreditNoteOverdueVal;
  r11.getCell(9).value = { formula: '-(G11+H11)', result: -sRetOut };
  r11.getCell(10).value = { formula: 'IF(C11<>0, (E11+F11)/C11, 0)', result: sRetSettledRate / 100 };
  for (let c = 1; c <= 10; c++) {
    const cell = r11.getCell(c);
    cell.font = { name: 'Arial', size: 8.5 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.zebraBg } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
    if (c >= 2 && c <= 9) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 10) cell.numFmt = '0.00%';
  }
  r11.height = 19;

  // Row 12: NET SALES RECEIVABLES
  const sNetBilled = salesGrossInvoicesVal - salesReturnsVal;
  const sSettledRate = sNetBilled > 0 ? ((salesPaidVal + salesClosedVal) / sNetBilled) * 100 : 0;
  const r12 = wsOut.getRow(12);
  r12.getCell(1).value = '💰 NET SALES RECEIVABLES';
  r12.getCell(2).value = { formula: 'B10+B11', result: salesGrossInvoicesVal };
  r12.getCell(3).value = { formula: 'C10+C11', result: salesReturnsVal };
  r12.getCell(4).value = { formula: 'D10+D11', result: sNetBilled };
  r12.getCell(5).value = { formula: 'E10-E11', result: salesPaidVal };
  r12.getCell(6).value = { formula: 'F10-F11', result: salesClosedVal };
  r12.getCell(7).value = { formula: 'G10-G11', result: salesOutstandingOpen };
  r12.getCell(8).value = { formula: 'H10-H11', result: salesOutstandingOverdue };
  r12.getCell(9).value = { formula: 'G12+H12', result: totalSalesOutstanding };
  r12.getCell(10).value = { formula: 'IF(D12<>0, (E12+F12)/D12, 0)', result: sSettledRate / 100 };
  for (let c = 1; c <= 10; c++) {
    const cell = r12.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.headerSales } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0F2FE' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
    if (c >= 2 && c <= 9) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 10) cell.numFmt = '0.00%';
  }
  r12.height = 21;

  // Row 13: Less Net Business Expenses (Under Sales)
  const r13 = wsOut.getRow(13);
  r13.getCell(1).value = '  ➖ Less: Net Business Expenses';
  r13.getCell(2).value = '-';
  r13.getCell(3).value = '-';
  r13.getCell(4).value = '-';
  r13.getCell(5).value = '-';
  r13.getCell(6).value = '-';
  r13.getCell(7).value = '-';
  r13.getCell(8).value = '-';
  r13.getCell(9).value = -totalNetExpenses;
  r13.getCell(10).value = '-';
  for (let c = 1; c <= 10; c++) {
    const cell = r13.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 9, color: { argb: 'B45309' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEF3C7' } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : c === 9 ? 'right' : 'center', vertical: 'middle' };
    if (c === 9) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
  }
  r13.height = 20;

  // Row 14: Less Total Payments Received (Under Sales)
  const r14 = wsOut.getRow(14);
  r14.getCell(1).value = '  ➖ Less: Total Payments Received';
  r14.getCell(2).value = '-';
  r14.getCell(3).value = '-';
  r14.getCell(4).value = '-';
  r14.getCell(5).value = '-';
  r14.getCell(6).value = '-';
  r14.getCell(7).value = '-';
  r14.getCell(8).value = '-';
  r14.getCell(9).value = -totalPaymentAmount;
  r14.getCell(10).value = '-';
  for (let c = 1; c <= 10; c++) {
    const cell = r14.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 9, color: { argb: '047857' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D1FAE5' } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : c === 9 ? 'right' : 'center', vertical: 'middle' };
    if (c === 9) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
  }
  r14.height = 20;

  // Row 15: FINAL ADJUSTED NET OUTSTANDING (Under Sales)
  const r15 = wsOut.getRow(15);
  r15.getCell(1).value = '🎯 FINAL ADJUSTED NET OUTSTANDING (Net Out - Net Exp - Payments Received)';
  r15.getCell(2).value = '-';
  r15.getCell(3).value = '-';
  r15.getCell(4).value = '-';
  r15.getCell(5).value = '-';
  r15.getCell(6).value = '-';
  r15.getCell(7).value = '-';
  r15.getCell(8).value = '-';
  r15.getCell(9).value = { formula: 'I12+I13+I14', result: totalSalesOutstanding - totalNetExpenses - totalPaymentAmount };
  r15.getCell(10).value = '-';
  for (let c = 1; c <= 10; c++) {
    const cell = r15.getCell(c);
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: '1E1B4B' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0E7FF' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : c === 9 ? 'right' : 'center', vertical: 'middle' };
    if (c === 9) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
  }
  r15.height = 23;

  // Row 16: Purchase Bills
  const pBillOut = purchaseBillOpenVal + purchaseBillOverdueVal;
  const pBillSettledRate = purchaseGrossBillsVal > 0 ? ((purBillPaidVal + purBillClosedVal) / purchaseGrossBillsVal) * 100 : 0;
  const r16 = wsOut.getRow(16);
  r16.getCell(1).value = '  ↳ Purchase Bills (Gross Purchases)';
  r16.getCell(2).value = purchaseGrossBillsVal;
  r16.getCell(3).value = 0;
  r16.getCell(4).value = { formula: 'B16-C16', result: purchaseGrossBillsVal };
  r16.getCell(5).value = purBillPaidVal;
  r16.getCell(6).value = purBillClosedVal;
  r16.getCell(7).value = purchaseBillOpenVal;
  r16.getCell(8).value = purchaseBillOverdueVal;
  r16.getCell(9).value = { formula: 'G16+H16', result: pBillOut };
  r16.getCell(10).value = { formula: 'IF(B16<>0, (E16+F16)/B16, 0)', result: pBillSettledRate / 100 };
  for (let c = 1; c <= 10; c++) {
    const cell = r16.getCell(c);
    cell.font = { name: 'Arial', size: 8.5 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.white } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
    if (c >= 2 && c <= 9) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 10) cell.numFmt = '0.00%';
  }
  r16.height = 19;

  // Row 17: Purchase Vendor Credits
  const pCredOut = purchaseDebitNoteOpenVal + purchaseDebitNoteOverdueVal;
  const pCredSettledRate = purchaseCreditsVal > 0 ? ((purCredPaidVal + purCredClosedVal) / purchaseCreditsVal) * 100 : 0;
  const r17 = wsOut.getRow(17);
  r17.getCell(1).value = '  ↳ Purchase Returns (Vendor Credits)';
  r17.getCell(2).value = 0;
  r17.getCell(3).value = purchaseCreditsVal;
  r17.getCell(4).value = { formula: 'B17-C17', result: -purchaseCreditsVal };
  r17.getCell(5).value = purCredPaidVal;
  r17.getCell(6).value = purCredClosedVal;
  r17.getCell(7).value = purchaseDebitNoteOpenVal;
  r17.getCell(8).value = purchaseDebitNoteOverdueVal;
  r17.getCell(9).value = { formula: '-(G17+H17)', result: -pCredOut };
  r17.getCell(10).value = { formula: 'IF(C17<>0, (E17+F17)/C17, 0)', result: pCredSettledRate / 100 };
  for (let c = 1; c <= 10; c++) {
    const cell = r17.getCell(c);
    cell.font = { name: 'Arial', size: 8.5 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.zebraBg } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
    if (c >= 2 && c <= 9) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 10) cell.numFmt = '0.00%';
  }
  r17.height = 19;

  // Row 18: NET PURCHASE PAYABLES
  const pNetBilled = purchaseGrossBillsVal - purchaseCreditsVal;
  const pSettledRate = pNetBilled > 0 ? ((purchasePaidVal + purchaseClosedVal) / pNetBilled) * 100 : 0;
  const r18 = wsOut.getRow(18);
  r18.getCell(1).value = '🛒 NET PURCHASE PAYABLES';
  r18.getCell(2).value = { formula: 'B16+B17', result: purchaseGrossBillsVal };
  r18.getCell(3).value = { formula: 'C16+C17', result: purchaseCreditsVal };
  r18.getCell(4).value = { formula: 'D16+D17', result: pNetBilled };
  r18.getCell(5).value = { formula: 'E16-E17', result: purchasePaidVal };
  r18.getCell(6).value = { formula: 'F16-F17', result: purchaseClosedVal };
  r18.getCell(7).value = { formula: 'G16-G17', result: purchaseOutstandingOpen };
  r18.getCell(8).value = { formula: 'H16-H17', result: purchaseOutstandingOverdue };
  r18.getCell(9).value = { formula: 'G18+H18', result: totalPurchaseOutstanding };
  r18.getCell(10).value = { formula: 'IF(D18<>0, (E18+F18)/D18, 0)', result: pSettledRate / 100 };
  for (let c = 1; c <= 10; c++) {
    const cell = r18.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.headerPurchase } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
    if (c >= 2 && c <= 9) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 10) cell.numFmt = '0.00%';
  }
  r18.height = 21;

  // 2. Ageing Buckets Matrix Table (Rows 20-23)
  wsOut.mergeCells('A20:K20');
  const ageSecTitle = wsOut.getCell('A20');
  ageSecTitle.value = '📊 AGEING ANALYSIS & TIME HORIZON BREAKDOWN';
  ageSecTitle.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
  ageSecTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3730A3' } };
  ageSecTitle.alignment = { vertical: 'middle', indent: 1 };
  wsOut.getRow(20).height = 22;

  const ageHeaders = ['Category / Type', '< 30 Days (₹)', '31 - 60 Days (₹)', '61 - 90 Days (₹)', '> 90 Days (₹)', 'Open Amount (₹)', 'Overdue Amount (₹)', 'Total Balance (₹)'];
  const ageHeadRow = wsOut.getRow(21);
  ageHeaders.forEach((h, idx) => {
    const cell = ageHeadRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx === 0 ? 'left' : 'right', vertical: 'middle' };
    cell.border = thinBorder;
  });
  ageHeadRow.height = 20;

  // Sales Ageing Row
  const sAgeRow = wsOut.getRow(22);
  sAgeRow.getCell(1).value = 'Sales Receivables (Customers)';
  sAgeRow.getCell(2).value = ageingBuckets.sales.under30;
  sAgeRow.getCell(3).value = ageingBuckets.sales.d30to60;
  sAgeRow.getCell(4).value = ageingBuckets.sales.d60to90;
  sAgeRow.getCell(5).value = ageingBuckets.sales.over90;
  sAgeRow.getCell(6).value = salesOutstandingOpen;
  sAgeRow.getCell(7).value = salesOutstandingOverdue;
  sAgeRow.getCell(8).value = { formula: 'SUM(B22:E22)', result: totalSalesOutstanding };

  for (let c = 1; c <= 8; c++) {
    const cell = sAgeRow.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 8 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.white } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
    if (c >= 2) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 1 || c === 8) cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.headerSales } };
  }
  sAgeRow.height = 18;

  // Purchase Ageing Row
  const pAgeRow = wsOut.getRow(23);
  pAgeRow.getCell(1).value = 'Purchase Payables (Vendors)';
  pAgeRow.getCell(2).value = ageingBuckets.purchase.under30;
  pAgeRow.getCell(3).value = ageingBuckets.purchase.d30to60;
  pAgeRow.getCell(4).value = ageingBuckets.purchase.d60to90;
  pAgeRow.getCell(5).value = ageingBuckets.purchase.over90;
  pAgeRow.getCell(6).value = purchaseOutstandingOpen;
  pAgeRow.getCell(7).value = purchaseOutstandingOverdue;
  pAgeRow.getCell(8).value = { formula: 'SUM(B23:E23)', result: totalPurchaseOutstanding };

  for (let c = 1; c <= 8; c++) {
    const cell = pAgeRow.getCell(c);
    cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 8 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.zebraBg } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' };
    if (c >= 2) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
    if (c === 1 || c === 8) cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.headerPurchase } };
  }
  pAgeRow.height = 18;

  // Party / Vendor Detail Table Header (Row 25)
  wsOut.mergeCells('A25:K25');
  const partySecTitle = wsOut.getCell('A25');
  partySecTitle.value = '👥 PARTY & VENDOR-WISE OUTSTANDING DETAIL WITH CREDIT NOTES';
  partySecTitle.font = { name: 'Arial', size: 10, bold: true, color: { argb: THEME.white } };
  partySecTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '312E81' } };
  partySecTitle.alignment = { vertical: 'middle', indent: 1 };
  wsOut.getRow(25).height = 22;

  const outPartyHeaders = [
    '#',
    'Type',
    'Party / Vendor Name',
    'Invoices / Bills (₹)',
    'Credit Notes / Vendor Credit (₹)',
    'Open Amount (₹)',
    'Overdue Amount (₹)',
    'Total Outstanding (₹)',
  ];

  const outHeadRow = wsOut.getRow(26);
  outPartyHeaders.forEach((h, idx) => {
    const cell = outHeadRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: THEME.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
    cell.alignment = { horizontal: idx >= 3 ? 'right' : idx === 0 ? 'center' : 'left', vertical: 'middle' };
    cell.border = thinBorder;
  });
  outHeadRow.height = 22;

  const sortedParties = Object.values(partyOutstandingMap).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  let currentOutRow = 27;
  const outPartyStart = currentOutRow;
  sortedParties.forEach((p, idx) => {
    const row = wsOut.getRow(currentOutRow);
    const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
    const curR = currentOutRow;

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = p.type;
    row.getCell(3).value = p.party;
    row.getCell(4).value = p.invBill;
    row.getCell(5).value = p.credNote;
    row.getCell(6).value = p.open;
    row.getCell(7).value = p.overdue;
    row.getCell(8).value = { formula: `F${curR}+G${curR}`, result: p.total };

    for (let c = 1; c <= 8; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 8.5, bold: c === 3 || c === 8 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c >= 4 ? 'right' : c === 1 ? 'center' : 'left', vertical: 'middle' };
      if (c >= 4) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      if (c === 2) {
        cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: p.type === 'Sales' ? THEME.headerSales : THEME.headerPurchase } };
      }
      if (c === 7 && p.overdue > 0) {
        cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.headerPurchase } };
      }
      if (c === 8) {
        cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
      }
    }
    row.height = 19;
    currentOutRow++;
  });

  const outPartyEnd = currentOutRow - 1;

  // Outstanding Summary Row for Parties
  const outTotalRow = wsOut.getRow(currentOutRow);
  outTotalRow.getCell(1).value = 'TOTAL';
  outTotalRow.getCell(3).value = `${sortedParties.length} Parties`;
  if (sortedParties.length > 0) {
    outTotalRow.getCell(4).value = { formula: `SUM(D${outPartyStart}:D${outPartyEnd})`, result: sortedParties.reduce((a, b) => a + b.invBill, 0) };
    outTotalRow.getCell(5).value = { formula: `SUM(E${outPartyStart}:E${outPartyEnd})`, result: sortedParties.reduce((a, b) => a + b.credNote, 0) };
    outTotalRow.getCell(6).value = { formula: `SUM(F${outPartyStart}:F${outPartyEnd})`, result: salesOutstandingOpen + purchaseOutstandingOpen };
    outTotalRow.getCell(7).value = { formula: `SUM(G${outPartyStart}:G${outPartyEnd})`, result: salesOutstandingOverdue + purchaseOutstandingOverdue };
    outTotalRow.getCell(8).value = { formula: `SUM(H${outPartyStart}:H${outPartyEnd})`, result: totalSalesOutstanding + totalPurchaseOutstanding };
  } else {
    outTotalRow.getCell(4).value = 0;
    outTotalRow.getCell(5).value = 0;
    outTotalRow.getCell(6).value = 0;
    outTotalRow.getCell(7).value = 0;
    outTotalRow.getCell(8).value = 0;
  }

  for (let c = 1; c <= 8; c++) {
    const cell = outTotalRow.getCell(c);
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: THEME.textDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
    cell.border = totalBorder;
    cell.alignment = { horizontal: c >= 4 ? 'right' : 'left', vertical: 'middle' };
    if (c >= 4) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
  }
  outTotalRow.height = 22;
  currentOutRow += 2;

    // Detailed Transaction-Level Outstanding Register
    if (includeRegisters) {
      const regTitleRow = currentOutRow;
      wsOut.mergeCells(`A${regTitleRow}:K${regTitleRow}`);
      const regTitle = wsOut.getCell(`A${regTitleRow}`);
      regTitle.value = `📑 DETAILED OPEN & OVERDUE TRANSACTION REGISTER (${allOutstandingItems.length} Records)`;
      regTitle.font = { name: 'Arial', size: 10, bold: true, color: { argb: THEME.white } };
      regTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
      regTitle.alignment = { vertical: 'middle', indent: 1 };
      wsOut.getRow(regTitleRow).height = 22;
      currentOutRow++;

      const regHeaders = [
        '#',
        'Category',
        'Date',
        'Ref #',
        'Party / Vendor Name',
        'Channel',
        'Transaction Type',
        'Status',
        'Days Old',
        'Total Net (₹)',
        'Outstanding Balance (₹)',
      ];

      const regHeadRow = wsOut.getRow(currentOutRow);
      regHeaders.forEach((h, idx) => {
        const cell = regHeadRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
        cell.alignment = { horizontal: idx >= 8 ? 'right' : idx <= 1 || idx === 7 ? 'center' : 'left', vertical: 'middle' };
        cell.border = thinBorder;
      });
      regHeadRow.height = 20;
      currentOutRow++;

      const outRegStart = currentOutRow;
      let regTotalNet = 0;
      let regTotalOut = 0;

      allOutstandingItems.forEach((item, idx) => {
        const row = wsOut.getRow(currentOutRow);
        const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;

        row.getCell(1).value = idx + 1;
        row.getCell(2).value = item.type;
        row.getCell(3).value = item.date;
        row.getCell(4).value = item.ref;
        row.getCell(5).value = item.party;
        row.getCell(6).value = item.channel;
        row.getCell(7).value = item.transType;
        row.getCell(8).value = item.status;
        row.getCell(9).value = item.days;
        row.getCell(10).value = item.amount;
        row.getCell(11).value = item.outstanding;

        regTotalNet += item.amount;
        regTotalOut += item.outstanding;

        for (let c = 1; c <= 11; c++) {
          const cell = row.getCell(c);
          cell.font = { name: 'Arial', size: 8.5, bold: c === 5 || c === 11 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.border = thinBorder;
          cell.alignment = { horizontal: c >= 9 ? 'right' : c <= 1 || c === 8 ? 'center' : 'left', vertical: 'middle' };
          if (c === 10 || c === 11) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
          if (c === 2) {
            cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: item.type === 'Sales' ? THEME.headerSales : THEME.headerPurchase } };
          }
          if (c === 8) {
            cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: item.status === 'Overdue' ? THEME.headerPurchase : THEME.accentGreen } };
          }
          if (c === 11) {
            cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
          }
        }
        row.height = 18;
        currentOutRow++;
      });

      const outRegEnd = currentOutRow - 1;

      // Detailed Register Total Row
      const regTotRow = wsOut.getRow(currentOutRow);
      regTotRow.getCell(1).value = 'TOTAL';
      regTotRow.getCell(5).value = `${allOutstandingItems.length} Transactions`;
      if (allOutstandingItems.length > 0) {
        regTotRow.getCell(10).value = { formula: `SUM(J${outRegStart}:J${outRegEnd})`, result: regTotalNet };
        regTotRow.getCell(11).value = { formula: `SUM(K${outRegStart}:K${outRegEnd})`, result: regTotalOut };
      } else {
        regTotRow.getCell(10).value = 0;
        regTotRow.getCell(11).value = 0;
      }

      for (let c = 1; c <= 11; c++) {
        const cell = regTotRow.getCell(c);
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: THEME.textDark } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
        cell.border = totalBorder;
        cell.alignment = { horizontal: c >= 9 ? 'right' : 'left', vertical: 'middle' };
        if (c === 10 || c === 11) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      }
      regTotRow.height = 22;
    }

    wsOut.columns = [
      { width: 6 },  // #
      { width: 12 }, // Type / Category
      { width: 14 }, // Date
      { width: 16 }, // Ref #
      { width: 28 }, // Party Name
      { width: 14 }, // Channel
      { width: 18 }, // Transaction Type
      { width: 12 }, // Status
      { width: 10 }, // Days Old
      { width: 18 }, // Total Net
      { width: 22 }, // Total Outstanding
    ];
  }

  // =========================================================================
  // SHEET 6: 💸 PAYMENT RECEIVED (SUMMARY & TRANSACTION LEVEL)
  // =========================================================================
  if (includePayment && paymentData && paymentData.length > 0) {
    const wsPay = workbook.addWorksheet('💸 Payment Received', {
      views: [{ showGridLines: false }],
      properties: { tabColor: { argb: '10B981' } }, // Emerald
    });

    wsPay.mergeCells('A1:G1');
    const payTitle = wsPay.getCell('A1');
    payTitle.value = 'PAYMENTS RECEIVED: SUMMARY & DETAILED TRANSACTION REGISTER';
    payTitle.font = { name: 'Arial', size: 14, bold: true, color: { argb: THEME.white } };
    payTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '059669' } };
    payTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    wsPay.getRow(1).height = 36;

    const avgPayment = paymentData.length > 0 ? totalPaymentAmount / paymentData.length : 0;
    addKpiCard(wsPay, 'A', 'B', '💸 TOTAL PAYMENTS RECEIVED', totalPaymentAmount, `${paymentData.length} Receipts Processed`, THEME.cardBg1, THEME.accentGreen);
    addKpiCard(wsPay, 'C', 'D', '🏢 PAYMENT CHANNELS', sortedPaymentChannels.length, `Active Collection Gateways`, THEME.cardBg2, THEME.headerDark);
    addKpiCard(wsPay, 'E', 'F', '📊 AVERAGE RECEIPT', avgPayment, `Per Payment Entry`, THEME.cardBg4, THEME.headerSales);
    addKpiCard(wsPay, 'G', 'G', '📅 PERIODS', sortedPaymentMonths.length, `Months Tracked`, THEME.cardBg5, THEME.headerDark);

    wsPay.getRow(4).height = 18;
    wsPay.getRow(5).height = 24;
    wsPay.getRow(6).height = 18;

    let payRow = 8;

    // 1. SUMMARY LEVEL: Channel Breakdown
    wsPay.mergeCells(`A${payRow}:E${payRow}`);
    const payChanSec = wsPay.getCell(`A${payRow}`);
    payChanSec.value = '📊 SUMMARY LEVEL: PAYMENT CHANNEL / SOURCE BREAKDOWN';
    payChanSec.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
    payChanSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '047857' } };
    payChanSec.alignment = { vertical: 'middle', indent: 1 };
    wsPay.getRow(payRow).height = 22;
    payRow++;

    const payChanHeaders = ['Channel / Source', 'Receipts Count', 'Total Amount Received (₹)', 'Average Receipt (₹)', '% Share of Total'];
    const pChanHeadRow = wsPay.getRow(payRow);
    payChanHeaders.forEach((h, idx) => {
      const cell = pChanHeadRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
      cell.alignment = { horizontal: idx >= 2 ? 'right' : idx === 1 ? 'center' : 'left', vertical: 'middle' };
      cell.border = thinBorder;
    });
    pChanHeadRow.height = 20;
    payRow++;

    const payChanStart = payRow;
    const payChanTotRowIdx = payChanStart + sortedPaymentChannels.length;

    sortedPaymentChannels.forEach((d, idx) => {
      const row = wsPay.getRow(payRow);
      const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
      const sharePct = totalPaymentAmount > 0 ? (d.total / totalPaymentAmount) * 100 : 0;
      const curR = payRow;

      row.getCell(1).value = d.channel;
      row.getCell(2).value = d.count;
      row.getCell(3).value = d.total;
      row.getCell(4).value = { formula: `IF(B${curR}<>0, C${curR}/B${curR}, 0)`, result: d.count > 0 ? d.total / d.count : 0 };
      row.getCell(5).value = { formula: `IF($C$${payChanTotRowIdx}<>0, C${curR}/$C$${payChanTotRowIdx}, 0)`, result: sharePct / 100 };

      for (let c = 1; c <= 5; c++) {
        const cell = row.getCell(c);
        cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 3 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = thinBorder;
        cell.alignment = { horizontal: c >= 3 ? 'right' : c === 2 ? 'center' : 'left', vertical: 'middle' };
        if (c === 3 || c === 4) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
        if (c === 5) cell.numFmt = '0.00%';
      }
      row.height = 18;
      payRow++;
    });

    const payChanEnd = payRow - 1;

    // Channel Total Row
    const payChanTotRow = wsPay.getRow(payRow);
    payChanTotRow.getCell(1).value = 'TOTAL';
    if (sortedPaymentChannels.length > 0) {
      payChanTotRow.getCell(2).value = { formula: `SUM(B${payChanStart}:B${payChanEnd})`, result: paymentData.length };
      payChanTotRow.getCell(3).value = { formula: `SUM(C${payChanStart}:C${payChanEnd})`, result: totalPaymentAmount };
      payChanTotRow.getCell(4).value = { formula: `IF(B${payChanTotRowIdx}<>0, C${payChanTotRowIdx}/B${payChanTotRowIdx}, 0)`, result: avgPayment };
      payChanTotRow.getCell(5).value = { formula: `SUM(E${payChanStart}:E${payChanEnd})`, result: 1.0 };
    } else {
      payChanTotRow.getCell(2).value = paymentData.length;
      payChanTotRow.getCell(3).value = totalPaymentAmount;
      payChanTotRow.getCell(4).value = avgPayment;
      payChanTotRow.getCell(5).value = 1.0;
    }

    for (let c = 1; c <= 5; c++) {
      const cell = payChanTotRow.getCell(c);
      cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
      cell.border = totalBorder;
      cell.alignment = { horizontal: c >= 3 ? 'right' : c === 2 ? 'center' : 'left', vertical: 'middle' };
      if (c === 3 || c === 4) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      if (c === 5) cell.numFmt = '0.00%';
    }
    payChanTotRow.height = 20;
    payRow += 2;

    // 2. SUMMARY LEVEL: Month-wise Breakdown
    wsPay.mergeCells(`A${payRow}:E${payRow}`);
    const payMonthSec = wsPay.getCell(`A${payRow}`);
    payMonthSec.value = '📅 SUMMARY LEVEL: MONTH-WISE PAYMENT SUMMARY';
    payMonthSec.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
    payMonthSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '065F46' } };
    payMonthSec.alignment = { vertical: 'middle', indent: 1 };
    wsPay.getRow(payRow).height = 22;
    payRow++;

    const payMonthHeaders = ['Month', 'Receipts Count', 'Total Amount Received (₹)', 'Average Receipt (₹)', '% Share of Total'];
    const pMonthHeadRow = wsPay.getRow(payRow);
    payMonthHeaders.forEach((h, idx) => {
      const cell = pMonthHeadRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
      cell.alignment = { horizontal: idx >= 2 ? 'right' : idx === 1 ? 'center' : 'left', vertical: 'middle' };
      cell.border = thinBorder;
    });
    pMonthHeadRow.height = 20;
    payRow++;

    const payMonthStart = payRow;
    const payMonthTotRowIdx = payMonthStart + sortedPaymentMonths.length;

    sortedPaymentMonths.forEach((d, idx) => {
      const row = wsPay.getRow(payRow);
      const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
      const sharePct = totalPaymentAmount > 0 ? (d.total / totalPaymentAmount) * 100 : 0;
      const curR = payRow;

      row.getCell(1).value = d.month;
      row.getCell(2).value = d.count;
      row.getCell(3).value = d.total;
      row.getCell(4).value = { formula: `IF(B${curR}<>0, C${curR}/B${curR}, 0)`, result: d.count > 0 ? d.total / d.count : 0 };
      row.getCell(5).value = { formula: `IF($C$${payMonthTotRowIdx}<>0, C${curR}/$C$${payMonthTotRowIdx}, 0)`, result: sharePct / 100 };

      for (let c = 1; c <= 5; c++) {
        const cell = row.getCell(c);
        cell.font = { name: 'Arial', size: 8.5, bold: c === 1 || c === 3 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = thinBorder;
        cell.alignment = { horizontal: c >= 3 ? 'right' : c === 2 ? 'center' : 'left', vertical: 'middle' };
        if (c === 3 || c === 4) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
        if (c === 5) cell.numFmt = '0.00%';
      }
      row.height = 18;
      payRow++;
    });

    const payMonthEnd = payRow - 1;

    // Month Total Row
    const payMonthTotRow = wsPay.getRow(payRow);
    payMonthTotRow.getCell(1).value = 'TOTAL';
    if (sortedPaymentMonths.length > 0) {
      payMonthTotRow.getCell(2).value = { formula: `SUM(B${payMonthStart}:B${payMonthEnd})`, result: paymentData.length };
      payMonthTotRow.getCell(3).value = { formula: `SUM(C${payMonthStart}:C${payMonthEnd})`, result: totalPaymentAmount };
      payMonthTotRow.getCell(4).value = { formula: `IF(B${payMonthTotRowIdx}<>0, C${payMonthTotRowIdx}/B${payMonthTotRowIdx}, 0)`, result: avgPayment };
      payMonthTotRow.getCell(5).value = { formula: `SUM(E${payMonthStart}:E${payMonthEnd})`, result: 1.0 };
    } else {
      payMonthTotRow.getCell(2).value = paymentData.length;
      payMonthTotRow.getCell(3).value = totalPaymentAmount;
      payMonthTotRow.getCell(4).value = avgPayment;
      payMonthTotRow.getCell(5).value = 1.0;
    }

    for (let c = 1; c <= 5; c++) {
      const cell = payMonthTotRow.getCell(c);
      cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
      cell.border = totalBorder;
      cell.alignment = { horizontal: c >= 3 ? 'right' : c === 2 ? 'center' : 'left', vertical: 'middle' };
      if (c === 3 || c === 4) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      if (c === 5) cell.numFmt = '0.00%';
    }
    payMonthTotRow.height = 20;
    payRow += 2;

    // 3. TRANSACTION LEVEL: Detailed Payment Register
    if (includeRegisters) {
      wsPay.mergeCells(`A${payRow}:G${payRow}`);
      const payRegSec = wsPay.getCell(`A${payRow}`);
      payRegSec.value = `📑 TRANSACTION LEVEL: DETAILED PAYMENT RECEIVED REGISTER (${paymentData.length} Records)`;
      payRegSec.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: THEME.white } };
      payRegSec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
      payRegSec.alignment = { vertical: 'middle', indent: 1 };
      wsPay.getRow(payRow).height = 22;
      payRow++;

      const payRegHeaders = ['#', 'Payment No', 'Bank Entry Date', 'Month', 'Channel / Gateway', 'Description', 'Amount Received (₹)'];
      const pRegHeadRow = wsPay.getRow(payRow);
      payRegHeaders.forEach((h, idx) => {
        const cell = pRegHeadRow.getCell(idx + 1);
        cell.value = h;
        cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.tableHeadSub } };
        cell.alignment = { horizontal: idx === 6 ? 'right' : idx === 0 || idx === 2 || idx === 3 ? 'center' : 'left', vertical: 'middle' };
        cell.border = thinBorder;
      });
      pRegHeadRow.height = 20;
      payRow++;

      const pRegStart = payRow;

      paymentData.forEach((p, idx) => {
        const row = wsPay.getRow(payRow);
        const bg = idx % 2 === 1 ? THEME.zebraBg : THEME.white;
        const amt = Number(p.Amount) || 0;

        row.getCell(1).value = idx + 1;
        row.getCell(2).value = p.Payment_No || '-';
        row.getCell(3).value = p.Bank_Entry_Date || '-';
        row.getCell(4).value = p.Month || '-';
        row.getCell(5).value = p.Channel || '-';
        row.getCell(6).value = p.Description || '-';
        row.getCell(7).value = amt;

        for (let c = 1; c <= 7; c++) {
          const cell = row.getCell(c);
          cell.font = { name: 'Arial', size: 8.5, bold: c === 7 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.border = thinBorder;
          cell.alignment = { horizontal: c === 7 ? 'right' : c === 1 || c === 3 || c === 4 ? 'center' : 'left', vertical: 'middle' };
          if (c === 7) {
            cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
            cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.accentGreen } };
          }
        }
        row.height = 18;
        payRow++;
      });

      const pRegEnd = payRow - 1;

      // Detailed Register Total Row
      const pTotRow = wsPay.getRow(payRow);
      pTotRow.getCell(1).value = 'TOTAL';
      pTotRow.getCell(6).value = `${paymentData.length} Payments Received`;
      if (paymentData.length > 0) {
        pTotRow.getCell(7).value = { formula: `SUM(G${pRegStart}:G${pRegEnd})`, result: totalPaymentAmount };
      } else {
        pTotRow.getCell(7).value = 0;
      }

      for (let c = 1; c <= 7; c++) {
        const cell = pTotRow.getCell(c);
        cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: THEME.textDark } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E2E8F0' } };
        cell.border = totalBorder;
        cell.alignment = { horizontal: c === 7 ? 'right' : 'left', vertical: 'middle' };
        if (c === 7) cell.numFmt = '"₹"#,##0.00;[Red]-"₹"#,##0.00;"₹"0.00';
      }
      pTotRow.height = 20;
    }

    wsPay.columns = [
      { width: 6 },  // #
      { width: 22 }, // Payment No
      { width: 16 }, // Bank Entry Date
      { width: 14 }, // Month
      { width: 18 }, // Channel
      { width: 45 }, // Description
      { width: 22 }, // Amount Received
    ];
  }

  // ----------------------------------------------------
  // WRITE FILE AND TRIGGER DOWNLOAD IN BROWSER
  // ----------------------------------------------------
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const dateStamp = new Date().toISOString().split('T')[0];
  anchor.download = `Business_Summary_Master_Report_${dateStamp}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
