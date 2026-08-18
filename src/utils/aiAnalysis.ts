import { SalesRecord, PurchaseRecord, ExpenseEntry, PaymentRecord } from '../types';
import { standardizeMonth, parseMonthTimestamp } from './monthUtils';
import { classifySalesRecord, classifyPurchaseRecord, parseNum } from './recordClassifier';

export function generateBusinessInsights(
  sales: SalesRecord[] = [],
  purchases: PurchaseRecord[] = [],
  expenses: ExpenseEntry[] = [],
  payments: PaymentRecord[] = []
) {
  let totalSales = 0, totalReturns = 0, receivedAmount = 0;
  let openInvoices = 0, openCreditNotes = 0;

  sales.forEach(s => {
    const debit = Number(s.Debit) || 0;
    const credit = Number(s.Credit) || 0;
    const status = (s.Status || '').toLowerCase();
    
    // Status Logic
    const isPaid = status.includes('paid') || status.includes('closed');
    const isOpen = status.includes('open') || status.includes('overdue') || !status;
    const { isInvoice, isReturn } = classifySalesRecord(s);

    if (isInvoice) totalSales += debit;
    if (isReturn) totalReturns += credit;

    if (isPaid && isInvoice) receivedAmount += debit;
    if (isOpen) {
      if (isInvoice) openInvoices += debit;
      if (isReturn) openCreditNotes += credit;
    }
  });

  const netSales = totalSales - totalReturns;
  const outstandingSales = openInvoices - openCreditNotes;

  let totalPurchases = 0, totalPurchaseReturns = 0, paidPurchases = 0;
  let openBills = 0, openDebitNotes = 0;

  purchases.forEach(p => {
    const credit = Number(p.Credit) || 0;
    const debit = Number(p.Debit) || 0;
    const status = (p.Status || '').toLowerCase();
    const isPaid = status.includes('paid') || status.includes('closed');
    const isOpen = status.includes('open') || status.includes('overdue') || !status;
    const { isBill, isCredit: isReturn } = classifyPurchaseRecord(p);

    if (isBill) totalPurchases += credit;
    if (isReturn) totalPurchaseReturns += debit;

    if (isPaid && isBill) paidPurchases += credit;
    if (isOpen) {
      if (isBill) openBills += credit;
      if (isReturn) openDebitNotes += debit;
    }
  });

  const netPurchases = totalPurchases - totalPurchaseReturns;
  const outstandingPurchases = openBills - openDebitNotes;

  let totalExpenses = 0;
  const expenseByCategory: Record<string, number> = {};
  expenses.forEach(e => {
    const amt = Number(e.netValue) || 0;
    totalExpenses += amt;
    const cat = e.name || 'Uncategorized';
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + amt;
  });

  let totalPaymentsRecorded = 0;
  payments.forEach(p => {
    totalPaymentsRecorded += (Number(p.Amount) || 0);
  });

  const profit = netSales - netPurchases - totalExpenses;

  const notes: string[] = [];
  
  if (profit < 0) {
    notes.push(`📉 Loss Analysis: The business is operating at a Net Loss of ₹${Math.abs(profit).toLocaleString('en-IN')}. This is primarily driven by ${netPurchases > netSales ? 'high purchase costs' : 'operational expenses'}. Action: Review pricing strategy or cut down non-essential expenses.`);
  } else {
    notes.push(`📈 Profitability: You have a Net Profit of ₹${profit.toLocaleString('en-IN')}. Good job keeping costs in check!`);
  }

  if (outstandingSales > (netSales * 0.1) && outstandingSales > 0) {
    notes.push(`⚠️ High Outstanding (Sales): You have ₹${outstandingSales.toLocaleString('en-IN')} stuck in open/overdue invoices. Action: Focus on immediate payment collection from clients.`);
  }

  if (outstandingPurchases > 0) {
    notes.push(`⏳ Pending Payables: You owe ₹${outstandingPurchases.toLocaleString('en-IN')} in open bills to your suppliers.`);
  }

  const topExpense = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1])[0];
  if (topExpense && topExpense[1] > 0) {
    notes.push(`💡 Major Cost Center: "${topExpense[0]}" is your highest expense category, taking up ₹${topExpense[1].toLocaleString('en-IN')}. Action: Evaluate if these costs can be optimized.`);
  }

  if (totalPaymentsRecorded < receivedAmount) {
    notes.push(`📊 Payment Sync Doubt: Your sales dashboard indicates ₹${receivedAmount.toLocaleString('en-IN')} is paid, but the Payment Received sheet only has ₹${totalPaymentsRecorded.toLocaleString('en-IN')}. Please verify the payment logs.`);
  }

  return {
    sales: { totalSales, totalReturns, netSales, receivedAmount, outstandingSales },
    purchases: { totalPurchases, totalPurchaseReturns, netPurchases, paidPurchases, outstandingPurchases },
    expenses: { totalExpenses, expenseByCategory },
    payments: { totalPaymentsRecorded },
    profit,
    notes
  };
}
