import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SalesRecord, PurchaseRecord, FilterState, PaymentRecord, ExpenseEntry } from '../types';
import { standardizeMonth, parseMonthTimestamp } from '../utils/monthUtils';
import { classifySalesRecord, classifyPurchaseRecord, parseNum } from '../utils/recordClassifier';
import { Bar, Doughnut } from 'react-chartjs-2';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend as RechartsLegend, ResponsiveContainer } from 'recharts';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

interface OutstandingDashboardProps {
  salesData: SalesRecord[];
  purchaseData: PurchaseRecord[];
  expenseData?: ExpenseEntry[];
  paymentData?: PaymentRecord[];
}

// Helper functions for parsing date and calculating days old accurately
function parseDateToTimestamp(dateStr: any): number | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str) return null;

  // 1. If numeric Excel serial date (e.g. 45000)
  if (!isNaN(Number(str)) && Number(str) > 30000 && Number(str) < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30)).getTime();
    return excelEpoch + Number(str) * 86400000;
  }

  // 2. Handle DD-MM-YYYY or DD/MM/YYYY specifically for Indian context
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
}

function calculateDaysOld(dateStr: any): number {
  const timestamp = parseDateToTimestamp(dateStr);
  if (!timestamp) return 0;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  const d = new Date(timestamp);
  const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  
  const diffMs = today - targetDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function OutstandingDashboard({ salesData, purchaseData, expenseData = [], paymentData = [] }: OutstandingDashboardProps) {
  const [filters, setFilters] = useState<FilterState>({
    channel: 'all',
    month: 'all',
    year: 'all',
  });
  const [viewType, setViewType] = useState<'sales' | 'purchase'>('sales');
  const [tableViewType, setTableViewType] = useState<'transaction' | 'party'>('transaction');

  // Extract unique Channels, Months, Years from both datasets
  const channels = useMemo(() => {
    const set = new Set<string>();
    salesData.forEach((s) => s.Channel && set.add(s.Channel.trim()));
    purchaseData.forEach((p) => p.Channel && set.add(p.Channel.trim()));
    expenseData.forEach((e) => e.marketplace && set.add(e.marketplace.trim()));
    paymentData.forEach((pm) => pm.Channel && set.add(pm.Channel.trim()));
    return Array.from(set).sort();
  }, [salesData, purchaseData, expenseData, paymentData]);

  const monthsList = useMemo(() => {
    const set = new Set<string>();
    salesData.forEach((s) => {
      const std = standardizeMonth(s.Month);
      if (std) set.add(std);
    });
    purchaseData.forEach((p) => {
      const std = standardizeMonth(p.Month);
      if (std) set.add(std);
    });
    expenseData.forEach((e) => {
      const std = standardizeMonth(e.month);
      if (std) set.add(std);
    });
    paymentData.forEach((pm) => {
      const std = standardizeMonth(pm.Month);
      if (std) set.add(std);
    });
    return Array.from(set).sort((a, b) => {
      const tA = parseMonthTimestamp(a);
      const tB = parseMonthTimestamp(b);
      if (tA && tB) return tA - tB;
      return a.localeCompare(b);
    });
  }, [salesData, purchaseData, expenseData, paymentData]);

  const yearsList = useMemo(() => {
    const set = new Set<string>();
    monthsList.forEach((m) => {
      const match = m.match(/\d{4}/);
      if (match) set.add(match[0]);
    });
    return Array.from(set).sort();
  }, [monthsList]);

  // Filter Data
  const filteredSales = useMemo(() => {
    return salesData.filter((item) => {
      const matchChannel =
        filters.channel === 'all' ||
        String(item.Channel).trim().toLowerCase() === String(filters.channel).trim().toLowerCase();
      const stdM = standardizeMonth(item.Month);
      const matchMonth =
        filters.month === 'all' ||
        stdM === String(filters.month).trim();
      const matchYear =
        filters.year === 'all' ||
        stdM.includes(filters.year);
      return matchChannel && matchMonth && matchYear;
    });
  }, [salesData, filters]);

  const filteredPurchase = useMemo(() => {
    return purchaseData.filter((item) => {
      const matchChannel =
        filters.channel === 'all' ||
        String(item.Channel).trim().toLowerCase() === String(filters.channel).trim().toLowerCase();
      const stdM = standardizeMonth(item.Month);
      const matchMonth =
        filters.month === 'all' ||
        stdM === String(filters.month).trim();
      const matchYear =
        filters.year === 'all' ||
        stdM.includes(filters.year);
      return matchChannel && matchMonth && matchYear;
    });
  }, [purchaseData, filters]);

  const filteredExpense = useMemo(() => {
    return (expenseData || []).filter((item) => {
      const matchChannel =
        filters.channel === 'all' ||
        String(item.marketplace || '').trim().toLowerCase() === String(filters.channel).trim().toLowerCase();
      const stdM = standardizeMonth(item.month);
      const matchMonth =
        filters.month === 'all' ||
        stdM === String(filters.month).trim();
      const matchYear =
        filters.year === 'all' ||
        stdM.includes(filters.year);
      return matchChannel && matchMonth && matchYear;
    });
  }, [expenseData, filters]);

  const filteredPayment = useMemo(() => {
    return (paymentData || []).filter((item) => {
      const matchChannel =
        filters.channel === 'all' ||
        String(item.Channel || '').trim().toLowerCase() === String(filters.channel).trim().toLowerCase();
      const stdM = standardizeMonth(item.Month);
      const matchMonth =
        filters.month === 'all' ||
        stdM === String(filters.month).trim();
      const matchYear =
        filters.year === 'all' ||
        stdM.includes(filters.year);
      return matchChannel && matchMonth && matchYear;
    });
  }, [paymentData, filters]);

  // Helper function for document settlement status classification
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

  // Outstanding calculations
  const salesOutstanding = useMemo(() => {
    let invoicesCount = 0;
    let creditNotesCount = 0;
    let invoiceOpenVal = 0;
    let invoiceOverdueVal = 0;
    let creditNoteOpenVal = 0;
    let creditNoteOverdueVal = 0;
    let paidCount = 0;
    let invPaidVal = 0;
    let retPaidVal = 0;
    let closedCount = 0;
    let invClosedVal = 0;
    let retClosedVal = 0;
    let overdueCount = 0;
    let openCount = 0;
    let totalGrossSales = 0;
    let totalInvoicesCount = 0;
    let totalSalesReturns = 0;
    let totalReturnsCount = 0;
    const items = [];

    for (const s of filteredSales) {
      const rawStatus = String(s.Document_Status || s.Status || s['Final Status'] || s['Document Status'] || '').trim();
      const days = calculateDaysOld(s.Date);

      const { isInvoice, isReturn, invVal, retVal } = classifySalesRecord(s);
      const docAmount = isInvoice ? invVal : retVal;

      if (isInvoice) {
        totalGrossSales += invVal;
        totalInvoicesCount++;
      } else {
        totalSalesReturns += retVal;
        totalReturnsCount++;
      }

      const status = classifySettlementStatus(rawStatus, days);

      if (status === 'Paid') {
        paidCount++;
        if (isInvoice) invPaidVal += docAmount;
        else retPaidVal += docAmount;
        items.push({
          type: 'Sales',
          date: s.Date,
          days: days,
          amount: docAmount,
          outstanding: 0,
          transType: s.Transaction_Type || (isReturn ? 'Credit Note' : 'Invoice'),
          ref: s.Reference_Number,
          status: 'Paid',
          statusCategory: 'paid',
          entity: s.Entity_Number,
          transDetail: s.Transaction_Details || '-'
        });
      } else if (status === 'Closed') {
        closedCount++;
        if (isInvoice) invClosedVal += docAmount;
        else retClosedVal += docAmount;
        items.push({
          type: 'Sales',
          date: s.Date,
          days: days,
          amount: docAmount,
          outstanding: 0,
          transType: s.Transaction_Type || (isReturn ? 'Credit Note' : 'Invoice'),
          ref: s.Reference_Number,
          status: 'Closed',
          statusCategory: 'closed',
          entity: s.Entity_Number,
          transDetail: s.Transaction_Details || '-'
        });
      } else if (status === 'Overdue') {
        overdueCount++;
        if (isReturn) {
          creditNotesCount++;
          creditNoteOverdueVal += docAmount;
        } else {
          invoicesCount++;
          invoiceOverdueVal += docAmount;
        }

        items.push({
          type: 'Sales',
          date: s.Date,
          days: days,
          amount: docAmount,
          outstanding: docAmount,
          transType: s.Transaction_Type || (isReturn ? 'Credit Note' : 'Invoice'),
          ref: s.Reference_Number,
          status: 'Overdue',
          statusCategory: 'outstanding',
          entity: s.Entity_Number,
          transDetail: s.Transaction_Details || '-'
        });
      } else {
        // status === 'Open'
        openCount++;
        if (isReturn) {
          creditNotesCount++;
          creditNoteOpenVal += docAmount;
        } else {
          invoicesCount++;
          invoiceOpenVal += docAmount;
        }

        items.push({
          type: 'Sales',
          date: s.Date,
          days: days,
          amount: docAmount,
          outstanding: docAmount,
          transType: s.Transaction_Type || (isReturn ? 'Credit Note' : 'Invoice'),
          ref: s.Reference_Number,
          status: 'Open',
          statusCategory: 'outstanding',
          entity: s.Entity_Number,
          transDetail: s.Transaction_Details || '-'
        });
      }
    }

    const netPaidVal = Math.round((invPaidVal - retPaidVal) * 100) / 100;
    const netClosedVal = Math.round((invClosedVal - retClosedVal) * 100) / 100;
    const netOpenVal = Math.round((invoiceOpenVal - creditNoteOpenVal) * 100) / 100;
    const netOverdueVal = Math.round((invoiceOverdueVal - creditNoteOverdueVal) * 100) / 100;
    const netTotalOutstanding = Math.round((netOpenVal + netOverdueVal) * 100) / 100;

    return {
      invoicesCount,
      creditNotesCount,
      totalInvoicesCount,
      totalReturnsCount,
      totalGrossSales: Math.round(totalGrossSales * 100) / 100,
      totalSalesReturns: Math.round(totalSalesReturns * 100) / 100,
      netSales: Math.round((totalGrossSales - totalSalesReturns) * 100) / 100,
      invoiceVal: Math.round((invoiceOpenVal + invoiceOverdueVal) * 100) / 100,
      creditNoteVal: Math.round((creditNoteOpenVal + creditNoteOverdueVal) * 100) / 100,
      invoiceOpenVal: Math.round(invoiceOpenVal * 100) / 100,
      invoiceOverdueVal: Math.round(invoiceOverdueVal * 100) / 100,
      creditNoteOpenVal: Math.round(creditNoteOpenVal * 100) / 100,
      creditNoteOverdueVal: Math.round(creditNoteOverdueVal * 100) / 100,
      paidCount,
      paidVal: netPaidVal,
      grossPaidVal: Math.round((invPaidVal + retPaidVal) * 100) / 100,
      invPaidVal: Math.round(invPaidVal * 100) / 100,
      retPaidVal: Math.round(retPaidVal * 100) / 100,
      closedCount,
      closedVal: netClosedVal,
      grossClosedVal: Math.round((invClosedVal + retClosedVal) * 100) / 100,
      invClosedVal: Math.round(invClosedVal * 100) / 100,
      retClosedVal: Math.round(retClosedVal * 100) / 100,
      openCount,
      overdueCount,
      netOpenVal,
      netOverdueVal,
      totalOutstanding: netTotalOutstanding,
      items
    };
  }, [filteredSales]);

  const purchaseOutstanding = useMemo(() => {
    let billsCount = 0;
    let debitNotesCount = 0;
    let billOpenVal = 0;
    let billOverdueVal = 0;
    let debitNoteOpenVal = 0;
    let debitNoteOverdueVal = 0;
    let paidCount = 0;
    let billPaidVal = 0;
    let credPaidVal = 0;
    let closedCount = 0;
    let billClosedVal = 0;
    let credClosedVal = 0;
    let overdueCount = 0;
    let openCount = 0;
    let totalGrossPurchases = 0;
    let totalBillsCount = 0;
    let totalVendorCredits = 0;
    let totalCreditsCount = 0;
    const items = [];

    for (const p of filteredPurchase) {
      const rawStatus = String(p.Document_Status || p.Status || p['Final Status'] || p['Document Status'] || '').trim();
      const days = calculateDaysOld(p.Date);

      const { isBill, isCredit, billVal, creditVal } = classifyPurchaseRecord(p);
      const docAmount = isBill ? billVal : creditVal;

      if (isBill) {
        totalGrossPurchases += billVal;
        totalBillsCount++;
      } else {
        totalVendorCredits += creditVal;
        totalCreditsCount++;
      }

      const status = classifySettlementStatus(rawStatus, days);

      if (status === 'Paid') {
        paidCount++;
        if (isBill) billPaidVal += docAmount;
        else credPaidVal += docAmount;
        items.push({
          type: 'Purchase',
          date: p.Date,
          days: days,
          amount: docAmount,
          outstanding: 0,
          transType: p.Transaction_Type || (isCredit ? 'Vendor Credit' : 'Bill'),
          ref: p.Reference_Number,
          status: 'Paid',
          statusCategory: 'paid',
          entity: p.Entity_Number,
          transDetail: p.Transaction_Details || '-'
        });
      } else if (status === 'Closed') {
        closedCount++;
        if (isBill) billClosedVal += docAmount;
        else credClosedVal += docAmount;
        items.push({
          type: 'Purchase',
          date: p.Date,
          days: days,
          amount: docAmount,
          outstanding: 0,
          transType: p.Transaction_Type || (isCredit ? 'Vendor Credit' : 'Bill'),
          ref: p.Reference_Number,
          status: 'Closed',
          statusCategory: 'closed',
          entity: p.Entity_Number,
          transDetail: p.Transaction_Details || '-'
        });
      } else if (status === 'Overdue') {
        overdueCount++;
        if (isCredit) {
          debitNotesCount++;
          debitNoteOverdueVal += docAmount;
        } else {
          billsCount++;
          billOverdueVal += docAmount;
        }

        items.push({
          type: 'Purchase',
          date: p.Date,
          days: days,
          amount: docAmount,
          outstanding: docAmount,
          transType: p.Transaction_Type || (isCredit ? 'Vendor Credit' : 'Bill'),
          ref: p.Reference_Number,
          status: 'Overdue',
          statusCategory: 'outstanding',
          entity: p.Entity_Number,
          transDetail: p.Transaction_Details || '-'
        });
      } else {
        // status === 'Open'
        openCount++;
        if (isCredit) {
          debitNotesCount++;
          debitNoteOpenVal += docAmount;
        } else {
          billsCount++;
          billOpenVal += docAmount;
        }

        items.push({
          type: 'Purchase',
          date: p.Date,
          days: days,
          amount: docAmount,
          outstanding: docAmount,
          transType: p.Transaction_Type || (isCredit ? 'Vendor Credit' : 'Bill'),
          ref: p.Reference_Number,
          status: 'Open',
          statusCategory: 'outstanding',
          entity: p.Entity_Number,
          transDetail: p.Transaction_Details || '-'
        });
      }
    }

    const netPaidVal = Math.round((billPaidVal - credPaidVal) * 100) / 100;
    const netClosedVal = Math.round((billClosedVal - credClosedVal) * 100) / 100;
    const netOpenVal = Math.round((billOpenVal - debitNoteOpenVal) * 100) / 100;
    const netOverdueVal = Math.round((billOverdueVal - debitNoteOverdueVal) * 100) / 100;
    const netTotalOutstanding = Math.round((netOpenVal + netOverdueVal) * 100) / 100;

    return {
      billsCount,
      debitNotesCount,
      totalBillsCount,
      totalCreditsCount,
      totalGrossPurchases: Math.round(totalGrossPurchases * 100) / 100,
      totalVendorCredits: Math.round(totalVendorCredits * 100) / 100,
      netPurchases: Math.round((totalGrossPurchases - totalVendorCredits) * 100) / 100,
      billVal: Math.round((billOpenVal + billOverdueVal) * 100) / 100,
      debitNoteVal: Math.round((debitNoteOpenVal + debitNoteOverdueVal) * 100) / 100,
      billOpenVal: Math.round(billOpenVal * 100) / 100,
      billOverdueVal: Math.round(billOverdueVal * 100) / 100,
      debitNoteOpenVal: Math.round(debitNoteOpenVal * 100) / 100,
      debitNoteOverdueVal: Math.round(debitNoteOverdueVal * 100) / 100,
      paidCount,
      paidVal: netPaidVal,
      grossPaidVal: Math.round((billPaidVal + credPaidVal) * 100) / 100,
      billPaidVal: Math.round(billPaidVal * 100) / 100,
      credPaidVal: Math.round(credPaidVal * 100) / 100,
      closedCount,
      closedVal: netClosedVal,
      grossClosedVal: Math.round((billClosedVal + credClosedVal) * 100) / 100,
      billClosedVal: Math.round(billClosedVal * 100) / 100,
      credClosedVal: Math.round(credClosedVal * 100) / 100,
      openCount,
      overdueCount,
      netOpenVal,
      netOverdueVal,
      totalOutstanding: netTotalOutstanding,
      items
    };
  }, [filteredPurchase]);

  // Net Expense & Payments Received Calculation for Outstanding reconciliation
  const netExpenseVal = useMemo(() => {
    const total = filteredExpense.reduce((sum, item) => sum + (parseNum(item.invoice) - parseNum(item.credit)), 0);
    return Math.round(total * 100) / 100;
  }, [filteredExpense]);

  const totalPaymentReceivedVal = useMemo(() => {
    const total = filteredPayment.reduce((sum, item) => sum + (Number(item.Amount) || 0), 0);
    return Math.round(total * 100) / 100;
  }, [filteredPayment]);

  const finalSalesAdjustedVal = useMemo(() => {
    return Math.round((salesOutstanding.totalOutstanding - netExpenseVal - totalPaymentReceivedVal) * 100) / 100;
  }, [salesOutstanding.totalOutstanding, netExpenseVal, totalPaymentReceivedVal]);

  const baseNetOutstanding = useMemo(() => {
    return viewType === 'sales' ? salesOutstanding.totalOutstanding : purchaseOutstanding.totalOutstanding;
  }, [viewType, salesOutstanding.totalOutstanding, purchaseOutstanding.totalOutstanding]);

  const finalNetOutstanding = useMemo(() => {
    return viewType === 'sales' ? finalSalesAdjustedVal : purchaseOutstanding.totalOutstanding;
  }, [viewType, finalSalesAdjustedVal, purchaseOutstanding.totalOutstanding]);

  // Status filter for table and list view
  const [statusFilter, setStatusFilter] = useState<'outstanding' | 'paid' | 'closed' | 'all'>('outstanding');

  // Strictly segregated items based on viewType
  const allCategorizedItems = useMemo(() => {
    if (viewType === 'sales') {
      return [...salesOutstanding.items].sort((a, b) => b.days - a.days);
    }
    return [...purchaseOutstanding.items].sort((a, b) => b.days - a.days);
  }, [salesOutstanding.items, purchaseOutstanding.items, viewType]);

  // Filtered items based on statusFilter
  const ageingItems = useMemo(() => {
    if (statusFilter === 'outstanding') {
      return allCategorizedItems.filter((i) => i.statusCategory === 'outstanding');
    }
    if (statusFilter === 'paid') {
      return allCategorizedItems.filter((i) => i.statusCategory === 'paid');
    }
    if (statusFilter === 'closed') {
      return allCategorizedItems.filter((i) => i.statusCategory === 'closed');
    }
    return allCategorizedItems;
  }, [allCategorizedItems, statusFilter]);

  const partyWiseItems = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of ageingItems) {
      const party = String(item.transDetail || 'Unknown').trim();
      const key = `${item.type}_${party}`;
      if (!map.has(key)) {
        map.set(key, {
          type: item.type,
          party: party,
          totalOutstanding: 0,
          invoiceOrBillAmount: 0,
          creditNoteOrVendorCreditAmount: 0,
          openAmount: 0,
          overdueAmount: 0,
        });
      }
      const entry = map.get(key);
      const valToAdd = item.outstanding > 0 ? item.outstanding : item.amount;
      entry.totalOutstanding += item.outstanding;

      const transTypeLower = String(item.transType || '').toLowerCase().trim();
      const isCreditOrDebit = item.type === 'Sales'
        ? (transTypeLower.includes('credit note') || transTypeLower.includes('return') || transTypeLower.includes('credit_note') || transTypeLower.includes('creditnote'))
        : (transTypeLower.includes('debit note') || transTypeLower.includes('debitnote') || transTypeLower.includes('vendor credit') || transTypeLower.includes('vendor_credit') || transTypeLower.includes('vendorcredit') || transTypeLower.includes('credit') || transTypeLower.includes('return'));

      if (isCreditOrDebit) {
        entry.creditNoteOrVendorCreditAmount += Math.abs(valToAdd);
      } else {
        entry.invoiceOrBillAmount += Math.abs(valToAdd);
      }

      if (String(item.status || '').toLowerCase().includes('overdue')) {
        entry.overdueAmount += item.outstanding;
      } else {
        entry.openAmount += item.outstanding;
      }
    }
    
    return Array.from(map.values())
      .map(entry => ({
        ...entry,
        totalOutstanding: Math.round(entry.totalOutstanding * 100) / 100,
        invoiceOrBillAmount: Math.round(entry.invoiceOrBillAmount * 100) / 100,
        creditNoteOrVendorCreditAmount: Math.round(entry.creditNoteOrVendorCreditAmount * 100) / 100,
        openAmount: Math.round(entry.openAmount * 100) / 100,
        overdueAmount: Math.round(entry.overdueAmount * 100) / 100,
      }))
      .sort((a, b) => Math.abs(b.totalOutstanding) - Math.abs(a.totalOutstanding));
  }, [ageingItems]);

  // Pagination & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Filtered Items (Transaction or Party wise)
  const listToPaginate = useMemo(() => {
    if (tableViewType === 'party') {
      if (!searchQuery.trim()) return partyWiseItems;
      const q = searchQuery.toLowerCase().trim();
      return partyWiseItems.filter((item) => {
        return (
          (item.type || '').toLowerCase().includes(q) ||
          (item.party || '').toLowerCase().includes(q) ||
          String(item.totalOutstanding || '').includes(q) ||
          String(item.invoiceOrBillAmount || '').includes(q) ||
          String(item.creditNoteOrVendorCreditAmount || '').includes(q) ||
          String(item.openAmount || '').includes(q) ||
          String(item.overdueAmount || '').includes(q)
        );
      });
    } else {
      if (!searchQuery.trim()) return ageingItems;
      const q = searchQuery.toLowerCase().trim();
      return ageingItems.filter((item) => {
        return (
          (item.type || '').toLowerCase().includes(q) ||
          (item.transType || '').toLowerCase().includes(q) ||
          (item.ref || '').toLowerCase().includes(q) ||
          (item.entity || '').toLowerCase().includes(q) ||
          (item.status || '').toLowerCase().includes(q) ||
          (item.transDetail || '').toLowerCase().includes(q) ||
          String(item.amount || '').includes(q) ||
          String(item.outstanding || '').includes(q) ||
          String(item.days || '').includes(q)
        );
      });
    }
  }, [tableViewType, partyWiseItems, ageingItems, searchQuery]);

  const totalRecords = listToPaginate.length;
  const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalRecords / pageSize)) : 1;
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedItems = useMemo(() => {
    if (pageSize <= 0) return listToPaginate;
    const start = (validPage - 1) * pageSize;
    return listToPaginate.slice(start, start + pageSize);
  }, [listToPaginate, validPage, pageSize]);

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

  // Ageing Buckets for chart
  const ageingBuckets = useMemo(() => {
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const item of ageingItems) {
      const val = Math.round(Math.abs(item.outstanding) * 100) / 100;
      if (item.days <= 30) buckets['0-30'] += val;
      else if (item.days <= 60) buckets['31-60'] += val;
      else if (item.days <= 90) buckets['61-90'] += val;
      else buckets['90+'] += val;
    }
    return {
      '0-30': Math.round(buckets['0-30'] * 100) / 100,
      '31-60': Math.round(buckets['31-60'] * 100) / 100,
      '61-90': Math.round(buckets['61-90'] * 100) / 100,
      '90+': Math.round(buckets['90+'] * 100) / 100,
    };
  }, [ageingItems]);

  const barChartData = {
    labels: ['0-30 Days', '31-60 Days', '61-90 Days', '90+ Days'],
    datasets: [
      {
        label: 'Outstanding Amount',
        data: [ageingBuckets['0-30'], ageingBuckets['31-60'], ageingBuckets['61-90'], ageingBuckets['90+']],
        backgroundColor: '#eab308', // yellow-500
        borderRadius: 4,
      }
    ]
  };

  const doughnutData = {
    labels: ['Sales Outstanding', 'Purchase Outstanding'],
    datasets: [
      {
        data: [
          Math.round(Math.abs(salesOutstanding.totalOutstanding) * 100) / 100,
          Math.round(Math.abs(purchaseOutstanding.totalOutstanding) * 100) / 100
        ],
        backgroundColor: ['#3b82f6', '#ef4444'],
        borderWidth: 0,
      }
    ]
  };

  const salesTransTypeData = {
    labels: ['Invoices', 'Credit Notes'],
    datasets: [
      {
        data: [
          Math.round(salesOutstanding.invoiceVal * 100) / 100,
          Math.round(salesOutstanding.creditNoteVal * 100) / 100
        ],
        backgroundColor: ['#3b82f6', '#f59e0b'],
        borderWidth: 0,
      }
    ]
  };

  const purchaseTransTypeData = {
    labels: ['Bills', 'Vendor Credits'],
    datasets: [
      {
        data: [
          Math.round(purchaseOutstanding.billVal * 100) / 100,
          Math.round(purchaseOutstanding.debitNoteVal * 100) / 100
        ],
        backgroundColor: ['#ef4444', '#10b981'],
        borderWidth: 0,
      }
    ]
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(45, 90, 90);
    doc.text(viewType === 'sales' ? 'Sales Outstanding Report' : 'Purchase Outstanding Report', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, pageWidth / 2, 28, { align: 'center' });

    let currentY = 40;

    const formatCurrency = (val: number) => `INR ${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    // Sales Section
    if (viewType === 'sales') {
      doc.setFontSize(14);
      doc.setTextColor(40, 40, 40);
      doc.text('Sales Outstanding Breakdown', 14, currentY);
      currentY += 8;

      autoTable(doc, {
        startY: currentY,
        head: [['Transaction Type', 'Status', 'Amount']],
        body: [
          ['Invoices', 'Open', formatCurrency(salesOutstanding.invoiceOpenVal)],
          ['Invoices', 'Overdue', formatCurrency(salesOutstanding.invoiceOverdueVal)],
          ['Credit Notes', 'Open', formatCurrency(salesOutstanding.creditNoteOpenVal)],
          ['Credit Notes', 'Overdue', formatCurrency(salesOutstanding.creditNoteOverdueVal)],
          ['Total Base Sales Outstanding', '', formatCurrency(salesOutstanding.totalOutstanding)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 10 },
      });
      
      currentY = (doc as any).lastAutoTable.finalY + 15;

      // Customer-wise breakdown
      const customerBalances: Record<string, number> = {};
      salesOutstanding.items.forEach(item => {
        const customer = item.accountName || item.transDetail || 'Unknown Customer';
        customerBalances[customer] = (customerBalances[customer] || 0) + item.outstanding;
      });

      const customerData = Object.entries(customerBalances)
        .map(([cust, amount]) => [cust, formatCurrency(Math.round(amount * 100) / 100)])
        .sort((a, b) => {
          const valA = parseFloat((a[1] as string).replace(/[^\d.-]/g, ''));
          const valB = parseFloat((b[1] as string).replace(/[^\d.-]/g, ''));
          return valB - valA;
        });

      if (customerData.length > 0) {
        if (currentY > 230) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(12);
        doc.text('Customer-wise Outstanding Balance', 14, currentY);
        currentY += 6;

        autoTable(doc, {
          startY: currentY,
          head: [['Customer / Party Name', 'Outstanding Balance']],
          body: customerData,
          theme: 'striped',
          headStyles: { fillColor: [59, 130, 246] },
          styles: { fontSize: 9 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // Reconciled Deductions
      if (currentY > 230) {
        doc.addPage();
        currentY = 20;
      }
      
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59);
      doc.text('Final Reconciled Net Outstanding Summary', 14, currentY);
      currentY += 6;

      autoTable(doc, {
        startY: currentY,
        head: [['Reconciliation Component', 'Operation', 'Amount (INR)']],
        body: [
          ['Base Sales Outstanding', 'Base Balance', formatCurrency(salesOutstanding.totalOutstanding)],
          ['Net Business Expenses', 'Less (-)', formatCurrency(netExpenseVal)],
          ['Total Payments Received', 'Less (-)', formatCurrency(totalPaymentReceivedVal)],
          ['FINAL ADJUSTED NET OUTSTANDING', 'Final Reconciled', formatCurrency(finalSalesAdjustedVal)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [30, 27, 75] },
        styles: { fontSize: 10, fontStyle: 'bold' },
      });
    }

    // Purchase Section
    if (viewType === 'purchase') {
      doc.setFontSize(14);
      doc.setTextColor(40, 40, 40);
      doc.text('Purchase Outstanding Breakdown', 14, currentY);
      currentY += 8;

      autoTable(doc, {
        startY: currentY,
        head: [['Transaction Type', 'Status', 'Amount']],
        body: [
          ['Bills', 'Open', formatCurrency(purchaseOutstanding.billOpenVal)],
          ['Bills', 'Overdue', formatCurrency(purchaseOutstanding.billOverdueVal)],
          ['Vendor Credits', 'Open', formatCurrency(purchaseOutstanding.debitNoteOpenVal)],
          ['Vendor Credits', 'Overdue', formatCurrency(purchaseOutstanding.debitNoteOverdueVal)],
          ['Total Purchase Outstanding', '', formatCurrency(purchaseOutstanding.totalOutstanding)]
        ],
        theme: 'grid',
        headStyles: { fillColor: [239, 68, 68] },
        styles: { fontSize: 10 },
      });
      
      currentY = (doc as any).lastAutoTable.finalY + 15;

      // Vendor-wise breakdown
      const vendorBalances: Record<string, number> = {};
      purchaseOutstanding.items.forEach(item => {
        const vendor = item.accountName || item.transDetail || 'Unknown Vendor';
        vendorBalances[vendor] = (vendorBalances[vendor] || 0) + item.outstanding;
      });

      const vendorData = Object.entries(vendorBalances)
        .map(([vendor, amount]) => [vendor, formatCurrency(Math.round(amount * 100) / 100)])
        .sort((a, b) => {
          const valA = parseFloat((a[1] as string).replace(/[^\d.-]/g, ''));
          const valB = parseFloat((b[1] as string).replace(/[^\d.-]/g, ''));
          return valB - valA;
        });

      if (vendorData.length > 0) {
        if (currentY > 230) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(12);
        doc.text('Vendor-wise Outstanding Balance', 14, currentY);
        currentY += 6;

        autoTable(doc, {
          startY: currentY,
          head: [['Vendor Name', 'Outstanding Balance']],
          body: vendorData,
          theme: 'striped',
          headStyles: { fillColor: [239, 68, 68] },
          styles: { fontSize: 9 },
        });
        currentY = (doc as any).lastAutoTable.finalY + 15;
      }
    }

    doc.save(`${viewType === 'sales' ? 'Sales' : 'Purchase'}_Outstanding_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-end justify-between">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Year</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 outline-none focus:border-[#2d5a5a]"
              value={filters.year}
              onChange={(e) => setFilters((prev) => ({ ...prev, year: e.target.value, month: 'all' }))}
            >
              <option value="all">All Years</option>
              {yearsList.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Month</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 outline-none focus:border-[#2d5a5a]"
              value={filters.month}
              onChange={(e) => setFilters((prev) => ({ ...prev, month: e.target.value }))}
            >
              <option value="all">All Months</option>
              {monthsList
                .filter((m) => filters.year === 'all' || m.includes(filters.year))
                .map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Channel / Marketplace</label>
            <select
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 outline-none focus:border-[#2d5a5a]"
              value={filters.channel}
              onChange={(e) => setFilters((prev) => ({ ...prev, channel: e.target.value }))}
            >
              <option value="all">All Channels</option>
              {channels.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        
        {/* View Toggle & Export */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button
              onClick={() => setViewType('sales')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                viewType === 'sales' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
            >
              <span>💰</span> Sales Outstanding
            </button>
            <button
              onClick={() => setViewType('purchase')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                viewType === 'purchase' ? 'bg-red-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 font-semibold'
              }`}
            >
              <span>🛒</span> Purchase Outstanding
            </button>
          </div>
          <button
            onClick={generatePDF}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#2d5a5a] text-white text-xs font-bold rounded-md shadow-sm hover:bg-[#1a3a3a] transition-colors"
          >
            <FileText size={16} />
            Export to PDF
          </button>
        </div>
      </div>



      {/* Net Outstanding Equation & Deduction Ribbon */}
      <div className="bg-gradient-to-r from-slate-900 via-[#1e293b] to-[#0f172a] text-white rounded-2xl p-5 shadow-lg border border-slate-700/60">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-700/80">
          <div className="flex items-center gap-2.5">
            <span className="px-3 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-black text-xs uppercase tracking-wider border border-emerald-500/40 flex items-center gap-1.5">
              <span>⚡</span> Outstanding Settlement Equation
            </span>
            <span className="text-xs text-slate-300 font-semibold">
              {viewType === 'purchase'
                ? 'Gross Purchases (₹) − Vendor Credits (₹) − Paid / Settled (₹) = Net Purchase Payables Pending'
                : 'Net Sales Outstanding (₹) − Net Expense (₹) − TOTAL PAYMENTS RECEIVED = Final Reconciled Net Outstanding'}
            </span>
          </div>
          <div className="text-xs text-slate-400 font-medium">
            Active Scope: <span className="font-bold text-emerald-400">{viewType.toUpperCase()}</span> ({filters.month !== 'all' ? filters.month : filters.year !== 'all' ? filters.year : 'All Time Periods'})
          </div>
        </div>

        {viewType === 'purchase' ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-stretch">
            {/* 1. Gross Purchases */}
            <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl p-4 border border-red-500/30 flex flex-col justify-between shadow-sm">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-red-300 mb-1 flex items-center justify-between">
                  <span>1. Gross Purchases</span>
                  <span className="text-[10px] bg-red-500/20 text-red-200 px-1.5 py-0.5 rounded font-bold border border-red-400/30">Bills</span>
                </div>
                <div className="text-2xl font-black text-white">
                  ₹ {purchaseOutstanding.totalGrossPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-[11px] text-red-200/80 mt-2 border-t border-slate-700 pt-1.5">
                {purchaseOutstanding.totalBillsCount} Total Bills
              </div>
            </div>

            {/* 2. Vendor Credits */}
            <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl p-4 border border-amber-500/40 flex flex-col justify-between shadow-sm">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300 mb-1 flex items-center justify-between">
                  <span>2. Less: Vendor Credits</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-black border border-amber-400/30">− Deduct</span>
                </div>
                <div className="text-2xl font-black text-amber-300">
                  −₹ {purchaseOutstanding.totalVendorCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-[11px] text-amber-200/80 mt-2 border-t border-slate-700 pt-1.5">
                {purchaseOutstanding.totalCreditsCount} Credit Notes
              </div>
            </div>

            {/* 3. Paid & Settled */}
            <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl p-4 border border-emerald-500/40 flex flex-col justify-between shadow-sm">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-300 mb-1 flex items-center justify-between">
                  <span>3. Less: Paid Settled</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-black border border-emerald-400/30">− Settled</span>
                </div>
                <div className="text-2xl font-black text-emerald-300">
                  −₹ {purchaseOutstanding.paidVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-[11px] text-emerald-200/80 mt-2 border-t border-slate-700 pt-1.5">
                {purchaseOutstanding.paidCount} Paid Bills
              </div>
            </div>

            {/* 4. Net Purchase Payables */}
            <div className="bg-gradient-to-br from-red-600 via-rose-600 to-red-700 text-white rounded-xl p-4 shadow-lg border border-red-400/50 flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-red-100 mb-1 flex items-center justify-between">
                  <span>4. Purchase Payables</span>
                  <span className="text-[10px] bg-black/30 text-white font-black px-2 py-0.5 rounded border border-white/20">Pending</span>
                </div>
                <div className="text-2xl font-black text-white tracking-tight">
                  ₹ {purchaseOutstanding.totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-[11px] text-red-100/90 font-medium mt-2 border-t border-red-500/50 pt-1.5">
                Open (₹{purchaseOutstanding.netOpenVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}) + Overdue (₹{purchaseOutstanding.netOverdueVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-stretch">
            {/* 1. Base Net Sales Outstanding */}
            <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl p-4 border border-blue-500/30 flex flex-col justify-between shadow-sm">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-blue-300 mb-1 flex items-center justify-between">
                  <span>1. Net Sales Outstanding</span>
                  <span className="text-[10px] bg-blue-500/20 text-blue-200 px-1.5 py-0.5 rounded font-bold border border-blue-400/30">Base</span>
                </div>
                <div className="text-2xl font-black text-white">
                  ₹ {salesOutstanding.totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-[11px] text-blue-200/80 mt-2 border-t border-slate-700 pt-1.5">
                Open (₹{salesOutstanding.netOpenVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}) + Overdue (₹{salesOutstanding.netOverdueVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
              </div>
            </div>

            {/* 2. Minus Net Expense */}
            <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl p-4 border border-amber-500/40 flex flex-col justify-between shadow-sm">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300 mb-1 flex items-center justify-between">
                  <span>2. Less: Net Expense</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-black border border-amber-400/30">− Deduct</span>
                </div>
                <div className="text-2xl font-black text-amber-300">
                  −₹ {netExpenseVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-[11px] text-amber-200/80 mt-2 border-t border-slate-700 pt-1.5">
                {filteredExpense.length} Expense Records
              </div>
            </div>

            {/* 3. Minus Payments Received */}
            <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl p-4 border border-emerald-500/40 flex flex-col justify-between shadow-sm">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-300 mb-1 flex items-center justify-between">
                  <span>3. Less: Payments Received</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-black border border-emerald-400/30">− Deduct</span>
                </div>
                <div className="text-2xl font-black text-emerald-300">
                  −₹ {totalPaymentReceivedVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-[11px] text-emerald-200/80 mt-2 border-t border-slate-700 pt-1.5">
                {filteredPayment.length} Bank Transactions
              </div>
            </div>

            {/* 4. Equals Final Reconciled Net Outstanding */}
            <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 text-white rounded-xl p-4 shadow-lg border border-emerald-400/50 flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-100 mb-1 flex items-center justify-between">
                  <span>4. Final Net Outstanding</span>
                  <span className="text-[10px] bg-black/30 text-white font-black px-2 py-0.5 rounded border border-white/20">Reconciled</span>
                </div>
                <div className="text-2xl font-black text-white tracking-tight">
                  ₹ {finalNetOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="text-[11px] text-emerald-100/90 font-medium mt-2 border-t border-emerald-500/50 pt-1.5">
                Sales Out − Expenses − Payments
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payment Trend Chart */}
      {paymentData.length > 0 && (
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 mb-6">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span> Payment Received Trend
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={Object.entries(
                  paymentData.reduce((acc, curr) => {
                    const date = curr.Bank_Entry_Date;
                    acc[date] = (acc[date] || 0) + curr.Amount;
                    return acc;
                  }, {} as Record<string, number>)
                )
                  .map(([date, amount]) => ({ date, amount }))
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  tickFormatter={(value) => `₹${value.toLocaleString()}`}
                  dx={-10}
                />
                <RechartsTooltip 
                  formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Amount Received']}
                  labelStyle={{ color: '#374151', fontWeight: 'bold', marginBottom: '4px' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                />
                <RechartsLegend wrapperStyle={{ paddingTop: '20px' }} />
                <Line 
                  type="monotone" 
                  dataKey="amount" 
                  name="Amount Received"
                  stroke="#10b981" 
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}



      {/* Sales & Purchase Complete Reconciliation & Lifecycle Summary Table */}
      <div className="bg-white rounded-xl shadow-sm border border-emerald-200/80 overflow-hidden">
        <div className="bg-gradient-to-r from-[#065F46] to-[#047857] text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm">
            <span>📈 Sales & Purchase Complete Reconciliation, Returns & Settlement Lifecycle</span>
          </div>
          <span className="text-xs bg-emerald-900/60 px-2.5 py-1 rounded-full text-emerald-100 font-semibold">
            Simple & Transparent Audit View
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-gray-100/90 text-gray-700 font-bold border-b border-gray-200">
                <th className="py-2.5 px-3">Transaction Stream / Type</th>
                <th className="py-2.5 px-3 text-right">Gross Billed</th>
                <th className="py-2.5 px-3 text-right">Returns & Credits</th>
                <th className="py-2.5 px-3 text-right">Net Document Value</th>
                <th className="py-2.5 px-3 text-right text-emerald-700">Paid Settled</th>
                <th className="py-2.5 px-3 text-right text-slate-700">Closed / Adjusted</th>
                <th className="py-2.5 px-3 text-right text-blue-700">Open Current</th>
                <th className="py-2.5 px-3 text-right text-rose-700">Overdue Pending</th>
                <th className="py-2.5 px-3 text-right font-extrabold">Net Outstanding</th>
                <th className="py-2.5 px-3 text-right">Settled %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-[11.5px]">
              {/* Sales Invoices */}
              {viewType === 'sales' && (
                <>
                  <tr className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-2 px-3 font-medium text-gray-800 flex items-center gap-1.5">
                      <span className="text-blue-500 font-bold">↳</span> Sales Invoices (Gross Sales)
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-900">₹ {salesOutstanding.totalGrossSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right text-gray-400">₹ 0.00</td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-900">₹ {salesOutstanding.totalGrossSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700">₹ {salesOutstanding.invPaidVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-medium text-slate-700">₹ {salesOutstanding.invClosedVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right text-blue-600">₹ {salesOutstanding.invoiceOpenVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right text-rose-600 font-medium">₹ {salesOutstanding.invoiceOverdueVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-bold text-blue-900">₹ {(salesOutstanding.invoiceOpenVal + salesOutstanding.invoiceOverdueVal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-600">
                      {salesOutstanding.totalGrossSales > 0 ? (((salesOutstanding.invPaidVal + salesOutstanding.invClosedVal) / salesOutstanding.totalGrossSales) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>

                  {/* Sales Returns */}
                  <tr className="hover:bg-gray-50/80 bg-amber-50/30 transition-colors">
                    <td className="py-2 px-3 font-medium text-amber-900 flex items-center gap-1.5">
                      <span className="text-amber-600 font-bold">↳</span> Sales Returns (Credit Notes)
                    </td>
                    <td className="py-2 px-3 text-right text-gray-400">₹ 0.00</td>
                    <td className="py-2 px-3 text-right font-semibold text-amber-700">₹ {salesOutstanding.totalSalesReturns.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-semibold text-amber-800">-₹ {salesOutstanding.totalSalesReturns.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-medium text-emerald-700">₹ {salesOutstanding.retPaidVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-medium text-slate-700">₹ {salesOutstanding.retClosedVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right text-amber-600">₹ {salesOutstanding.creditNoteOpenVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right text-rose-600">₹ {salesOutstanding.creditNoteOverdueVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-bold text-amber-900">-₹ {(salesOutstanding.creditNoteOpenVal + salesOutstanding.creditNoteOverdueVal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-600">
                      {salesOutstanding.totalSalesReturns > 0 ? (((salesOutstanding.retPaidVal + salesOutstanding.retClosedVal) / salesOutstanding.totalSalesReturns) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>

                  {/* Net Sales Subtotal */}
                  <tr className="bg-blue-50/90 font-bold text-blue-950 border-t border-b border-blue-200">
                    <td className="py-2.5 px-3 flex items-center gap-1.5">
                      <span>💰 NET SALES RECEIVABLES</span>
                    </td>
                    <td className="py-2.5 px-3 text-right">₹ {salesOutstanding.totalGrossSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right text-amber-700">₹ {salesOutstanding.totalSalesReturns.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-blue-900">₹ {salesOutstanding.netSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-800">₹ {salesOutstanding.paidVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">₹ {salesOutstanding.closedVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right text-blue-800">₹ {salesOutstanding.netOpenVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right text-rose-700">₹ {salesOutstanding.netOverdueVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right font-black text-blue-800 text-xs">₹ {salesOutstanding.totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-blue-900">
                      {salesOutstanding.netSales > 0 ? (((salesOutstanding.paidVal + salesOutstanding.closedVal) / salesOutstanding.netSales) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>

                  {/* Less Net Expenses Row (Under Sales) */}
                  <tr className="bg-amber-50/70 text-amber-950 border-t border-amber-200 font-medium">
                    <td className="py-2.5 px-3 flex items-center gap-1.5 font-bold text-amber-900">
                      <span className="text-amber-600 font-bold">➖</span> Less: Net Business Expenses
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right font-bold text-amber-900">
                      -₹ {netExpenseVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                  </tr>

                  {/* Less Total Payments Received Row (Under Sales) */}
                  <tr className="bg-emerald-50/70 text-emerald-950 border-t border-emerald-200 font-medium">
                    <td className="py-2.5 px-3 flex items-center gap-1.5 font-bold text-emerald-900">
                      <span className="text-emerald-600 font-bold">➖</span> Less: Total Payments Received
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-900">
                      -₹ {totalPaymentReceivedVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-400">-</td>
                  </tr>

                  {/* Final Reconciled Net Outstanding Row (Under Sales) */}
                  <tr className="bg-indigo-900 text-white font-extrabold border-t-2 border-indigo-950">
                    <td className="py-3 px-3 flex items-center gap-1.5 text-xs text-indigo-100">
                      <span>🎯 FINAL ADJUSTED NET OUTSTANDING (Net Out - Net Exp - Payments Received)</span>
                    </td>
                    <td className="py-3 px-3 text-right text-indigo-300">-</td>
                    <td className="py-3 px-3 text-right text-indigo-300">-</td>
                    <td className="py-3 px-3 text-right text-indigo-300">-</td>
                    <td className="py-3 px-3 text-right text-indigo-300">-</td>
                    <td className="py-3 px-3 text-right text-indigo-300">-</td>
                    <td className="py-3 px-3 text-right text-indigo-300">-</td>
                    <td className="py-3 px-3 text-right text-indigo-300">-</td>
                    <td className="py-3 px-3 text-right font-black text-sm text-emerald-300">
                      ₹ {finalNetOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right text-indigo-300">-</td>
                  </tr>
                </>
              )}

              {/* Purchase Bills */}
              {viewType === 'purchase' && (
                <>
                  <tr className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-2 px-3 font-medium text-gray-800 flex items-center gap-1.5">
                      <span className="text-red-500 font-bold">↳</span> Purchase Bills (Gross Purchases)
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-900">₹ {purchaseOutstanding.totalGrossPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right text-gray-400">₹ 0.00</td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-900">₹ {purchaseOutstanding.totalGrossPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700">₹ {purchaseOutstanding.billPaidVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-medium text-slate-700">₹ {purchaseOutstanding.billClosedVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right text-red-600">₹ {purchaseOutstanding.billOpenVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right text-rose-600 font-medium">₹ {purchaseOutstanding.billOverdueVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-bold text-red-900">₹ {(purchaseOutstanding.billOpenVal + purchaseOutstanding.billOverdueVal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-600">
                      {purchaseOutstanding.totalGrossPurchases > 0 ? (((purchaseOutstanding.billPaidVal + purchaseOutstanding.billClosedVal) / purchaseOutstanding.totalGrossPurchases) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>

                  {/* Purchase Vendor Credits */}
                  <tr className="hover:bg-gray-50/80 bg-emerald-50/20 transition-colors">
                    <td className="py-2 px-3 font-medium text-emerald-900 flex items-center gap-1.5">
                      <span className="text-emerald-600 font-bold">↳</span> Purchase Returns (Vendor Credits)
                    </td>
                    <td className="py-2 px-3 text-right text-gray-400">₹ 0.00</td>
                    <td className="py-2 px-3 text-right font-semibold text-emerald-700">₹ {purchaseOutstanding.totalVendorCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-semibold text-emerald-800">-₹ {purchaseOutstanding.totalVendorCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-medium text-emerald-700">₹ {purchaseOutstanding.credPaidVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-medium text-slate-700">₹ {purchaseOutstanding.credClosedVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right text-emerald-600">₹ {purchaseOutstanding.debitNoteOpenVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right text-rose-600">₹ {purchaseOutstanding.debitNoteOverdueVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-900">-₹ {(purchaseOutstanding.debitNoteOpenVal + purchaseOutstanding.debitNoteOverdueVal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-600">
                      {purchaseOutstanding.totalVendorCredits > 0 ? (((purchaseOutstanding.credPaidVal + purchaseOutstanding.credClosedVal) / purchaseOutstanding.totalVendorCredits) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>

                  {/* Net Purchase Subtotal */}
                  <tr className="bg-red-50/90 font-bold text-red-950 border-t border-b border-red-200">
                    <td className="py-2.5 px-3 flex items-center gap-1.5">
                      <span>🛒 NET PURCHASE PAYABLES</span>
                    </td>
                    <td className="py-2.5 px-3 text-right">₹ {purchaseOutstanding.totalGrossPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-700">₹ {purchaseOutstanding.totalVendorCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-red-900">₹ {purchaseOutstanding.netPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-800">₹ {purchaseOutstanding.paidVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right text-slate-800">₹ {purchaseOutstanding.closedVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right text-red-800">₹ {purchaseOutstanding.netOpenVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right text-rose-700">₹ {purchaseOutstanding.netOverdueVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right font-black text-red-800 text-xs">₹ {purchaseOutstanding.totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-red-900">
                      {purchaseOutstanding.netPurchases > 0 ? (((purchaseOutstanding.paidVal + purchaseOutstanding.closedVal) / purchaseOutstanding.netPurchases) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Type Breakdown Charts */}
      <div className="grid grid-cols-1 gap-4">
        {viewType === 'sales' ? (
          <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-100">
            <h3 className="text-sm font-bold text-black mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                Sales: Invoice vs Credit Note
              </span>
              <span className="text-xs text-black font-bold">Transaction Type</span>
            </h3>
            <div className="h-56 flex justify-center pb-2">
              <Doughnut
                data={salesTransTypeData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: {
                        boxWidth: 12,
                        font: { weight: 'bold', size: 11 },
                        color: '#000000',
                      },
                    },
                    datalabels: {
                      color: '#000000',
                      font: { weight: 'bold', size: 11 },
                      formatter: (value: number) => value > 0 ? `₹${Math.round(value).toLocaleString('en-IN')}` : '',
                    },
                  },
                  cutout: '65%',
                }}
              />
            </div>
          </div>
        ) : (
          <div className="bg-white p-4 rounded-xl shadow-sm border border-red-100">
            <h3 className="text-sm font-bold text-black mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                Purchase: Bill vs Vendor Credit
              </span>
              <span className="text-xs text-black font-bold">Transaction Type</span>
            </h3>
            <div className="h-56 flex justify-center pb-2">
              <Doughnut
                data={purchaseTransTypeData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: {
                        boxWidth: 12,
                        font: { weight: 'bold', size: 11 },
                        color: '#000000',
                      },
                    },
                    datalabels: {
                      color: '#000000',
                      font: { weight: 'bold', size: 11 },
                      formatter: (value: number) => value > 0 ? `₹${Math.round(value).toLocaleString('en-IN')}` : '',
                    },
                  },
                  cutout: '65%',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-black mb-4">📊 Outstanding Ageing (Days)</h3>
          <div className="h-64">
            <Bar
              data={barChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  datalabels: {
                    color: '#000000',
                    font: { weight: 'bold', size: 11 },
                    formatter: (value: number) => value > 0 ? `₹${Math.round(value).toLocaleString('en-IN')}` : '',
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    grid: { color: '#f3f4f6' },
                    ticks: {
                      font: { weight: 'bold', size: 11 },
                      color: '#000000',
                    },
                  },
                  x: {
                    grid: { display: false },
                    ticks: {
                      font: { weight: 'bold', size: 11 },
                      color: '#000000',
                    },
                  },
                },
              }}
            />
          </div>
        </div>
      </div>

      {/* Ageing Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Status Filter Tab Pills & View Mode */}
        <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex bg-gray-200/80 p-0.5 rounded-lg border border-gray-300">
              <button
                onClick={() => { setStatusFilter('outstanding'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                  statusFilter === 'outstanding' ? 'bg-[#1a3a3a] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>⏳ Pending Outstanding</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${statusFilter === 'outstanding' ? 'bg-white/20 text-white' : 'bg-gray-300 text-gray-700'}`}>
                  {allCategorizedItems.filter(i => i.statusCategory === 'outstanding').length}
                </span>
              </button>
              <button
                onClick={() => { setStatusFilter('paid'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                  statusFilter === 'paid' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>💰 Paid Settled</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${statusFilter === 'paid' ? 'bg-white/20 text-white' : 'bg-gray-300 text-gray-700'}`}>
                  {allCategorizedItems.filter(i => i.statusCategory === 'paid').length}
                </span>
              </button>
              <button
                onClick={() => { setStatusFilter('closed'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                  statusFilter === 'closed' ? 'bg-slate-700 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>🔒 Closed</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${statusFilter === 'closed' ? 'bg-white/20 text-white' : 'bg-gray-300 text-gray-700'}`}>
                  {allCategorizedItems.filter(i => i.statusCategory === 'closed').length}
                </span>
              </button>
              <button
                onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                  statusFilter === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>📋 All Records</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${statusFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-300 text-gray-700'}`}>
                  {allCategorizedItems.length}
                </span>
              </button>
            </div>

            <div className="flex bg-gray-200/80 p-0.5 rounded-lg border border-gray-300">
              <button
                onClick={() => { setTableViewType('transaction'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  tableViewType === 'transaction' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Transaction Detail
              </button>
              <button
                onClick={() => { setTableViewType('party'); setCurrentPage(1); }}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  tableViewType === 'party' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Party / Vendor Wise
              </button>
            </div>
          </div>
          <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-200 font-medium">
            {tableViewType === 'party' 
              ? `Total ${listToPaginate.length} Parties (${ageingItems.length} Records)`
              : `Total ${listToPaginate.length} Records`}
          </span>
        </div>

        {/* Toolbar with Search and Page Size Selector */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 p-3 bg-gray-50/50 border-b border-gray-100 text-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 text-gray-400" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search reference, entity, detail, or status..."
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1a3a3a]"
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

        <div className="overflow-x-auto">
          {tableViewType === 'transaction' ? (
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-gray-200 text-gray-500 text-xs text-left">
                <tr>
                  <th className="py-3 px-3 font-semibold text-center w-12 bg-gray-50">#</th>
                  <th className="py-3 px-4 font-semibold">Type</th>
                  <th className="py-3 px-4 font-semibold">Trans. Type</th>
                  <th className="py-3 px-4 font-semibold">Ref Number</th>
                  <th className="py-3 px-4 font-semibold">Entity Number</th>
                  <th className="py-3 px-4 font-semibold">Date</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Transaction Detail</th>
                  <th className="py-3 px-4 font-semibold text-right">Net Amount</th>
                  <th className="py-3 px-4 font-semibold text-right">Outstanding</th>
                  <th className="py-3 px-4 font-semibold text-center">Days Old</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-gray-500 bg-gray-50/50">
                      No matching outstanding records found.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item, idx) => {
                    const rowNum = pageSize === 0 ? idx + 1 : (validPage - 1) * pageSize + idx + 1;
                    const isOverdue = String(item.status || '').toLowerCase().includes('overdue');
                    return (
                      <tr key={idx} className={`hover:bg-gray-50/80 transition-colors ${isOverdue ? 'bg-red-50/50' : ''}`}>
                        <td className="py-2.5 px-3 text-xs text-gray-400 font-mono text-center bg-gray-50/30">{rowNum}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.type === 'Sales' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-red-50 text-red-600 border border-red-100'
                          }`}>
                            {item.type}
                          </span>
                        </td>
                      <td className="py-2.5 px-4 text-gray-600 truncate max-w-[120px]" title={item.transType}>{item.transType}</td>
                      <td className="py-2.5 px-4 font-mono text-xs text-gray-500">{item.ref || '-'}</td>
                      <td className="py-2.5 px-4 font-mono text-xs text-gray-500">{item.entity || '-'}</td>
                      <td className="py-2.5 px-4 text-gray-600 whitespace-nowrap">{item.date}</td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          isOverdue ? 'bg-red-100 text-red-800 border-red-300' :
                          String(item.status || '').toLowerCase().includes('paid') ? 'bg-green-50 text-green-700 border-green-200' :
                          String(item.status || '').toLowerCase().includes('pending') ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                          'bg-gray-50 text-gray-600 border-gray-200'
                        }`}>
                          {item.status || 'Pending'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-medium text-gray-800 truncate max-w-[200px]" title={item.transDetail}>{item.transDetail}</td>
                      <td className="py-2.5 px-4 text-right text-gray-600">₹ {item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-[#1a3a3a]">
                        ₹ {item.outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          item.days > 90 ? 'bg-red-100 text-red-800' :
                          item.days > 60 ? 'bg-orange-100 text-orange-700' :
                          item.days > 30 ? 'bg-yellow-100 text-yellow-700' :
                          item.days < 0 ? 'bg-gray-100 text-gray-600' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {item.days} Days
                        </span>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-gray-200 text-gray-500 text-xs text-left">
                <tr>
                  <th className="py-3 px-3 font-semibold text-center w-12 bg-gray-50">#</th>
                  <th className="py-3 px-4 font-semibold">Type</th>
                  <th className="py-3 px-4 font-semibold">Party / Vendor Name</th>
                  <th className="py-3 px-4 font-semibold text-right">Invoices / Bills</th>
                  <th className="py-3 px-4 font-semibold text-right text-amber-700">Credit Note / Vendor Credit</th>
                  <th className="py-3 px-4 font-semibold text-right">Open Amount</th>
                  <th className="py-3 px-4 font-semibold text-right text-red-600">Overdue Amount</th>
                  <th className="py-3 px-4 font-semibold text-right text-black">Total Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-500 bg-gray-50/50">
                      No matching records found.
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item, idx) => {
                    const rowNum = pageSize === 0 ? idx + 1 : (validPage - 1) * pageSize + idx + 1;
                    return (
                      <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-2.5 px-3 text-xs text-gray-400 font-mono text-center bg-gray-50/30">{rowNum}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.type === 'Sales' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-red-50 text-red-600 border border-red-100'
                          }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-medium text-gray-800 truncate max-w-[240px]" title={item.party}>{item.party}</td>
                        <td className="py-2.5 px-4 text-right text-gray-700 font-medium">
                          ₹ {item.invoiceOrBillAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-right font-medium text-amber-600">
                          {item.creditNoteOrVendorCreditAmount > 0 ? (
                            <span>₹ {item.creditNoteOrVendorCreditAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right text-gray-600">
                          ₹ {item.openAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-right font-medium text-red-600">
                          ₹ {item.overdueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-[#1a3a3a]">
                          ₹ {item.totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Bottom Pagination Bar */}
        {pageSize > 0 && totalPages > 1 && (
          <div className="flex justify-between items-center p-3 border-t border-gray-200 flex-wrap gap-2 text-xs bg-gray-50">
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
                        ? 'bg-[#1a3a3a] text-white border-[#1a3a3a]'
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
    </div>
  );
}
