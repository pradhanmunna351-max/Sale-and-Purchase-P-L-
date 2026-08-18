import { SalesRecord, PurchaseRecord } from '../types';

export const parseNum = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val || '').replace(/[^0-9.-]/g, '').trim();
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
};

/**
 * Classifies a Sales record accurately into Invoice or Return
 */
export function classifySalesRecord(s: SalesRecord) {
  const transType = String(s.Transaction_Type || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const debit = parseNum(s.Debit);
  const credit = parseNum(s.Credit);
  const net = parseNum(s.Net_Amount);
  const outBal = parseNum(s.Outstanding_Balance);

  let isReturn = transType.includes('credit') || transType.includes('return') || transType.includes('cn') || transType.includes('refund') || transType.includes('discount');
  let isInvoice = transType.includes('invoice') || transType.includes('inv') || transType.includes('sale') || transType.includes('sales') || transType.includes('debitnote') || transType.includes('bill');

  if (!isReturn && !isInvoice) {
    if (credit > 0 && debit === 0) {
      isInvoice = true;
    } else if (debit > 0 && credit === 0) {
      isReturn = true;
    } else if (credit >= debit && credit > 0) {
      isInvoice = true;
    } else if (debit > credit && debit > 0) {
      isReturn = true;
    } else if (net > 0) {
      isInvoice = true;
    } else if (net < 0) {
      isReturn = true;
    } else if (outBal !== 0) {
      isInvoice = outBal > 0;
      isReturn = outBal < 0;
    } else {
      isInvoice = true;
    }
  }

  let invVal = 0;
  let retVal = 0;

  if (isInvoice) {
    invVal = credit !== 0 ? Math.abs(credit) : (debit !== 0 ? Math.abs(debit) : (net !== 0 ? Math.abs(net) : Math.abs(outBal)));
  } else {
    retVal = debit !== 0 ? Math.abs(debit) : (credit !== 0 ? Math.abs(credit) : (net !== 0 ? Math.abs(net) : Math.abs(outBal)));
  }

  return { isInvoice, isReturn, invVal, retVal, invoiceVal: invVal, grossSale: invVal, returnVal: retVal };
}

/**
 * Classifies a Purchase record accurately into Bill (COGS) or Vendor Credit / Debit Note
 */
export function classifyPurchaseRecord(p: PurchaseRecord) {
  const transType = String(p.Transaction_Type || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const debit = parseNum(p.Debit);
  const credit = parseNum(p.Credit);
  const net = parseNum(p.Net_Amount);
  const outBal = parseNum(p.Outstanding_Balance);

  let isCredit = transType.includes('credit') || transType.includes('vendorcredit') || transType.includes('debitnote') || transType.includes('return') || transType.includes('refund') || transType.includes('vc') || transType.includes('discount');
  let isBill = transType.includes('bill') || transType.includes('purchase') || transType.includes('invoice') || transType.includes('inv') || transType.includes('po') || transType.includes('order');

  if (!isCredit && !isBill) {
    if (debit > 0 && credit === 0) {
      isBill = true;
    } else if (credit > 0 && debit === 0) {
      const statusLower = String(p.Document_Status || p.Status || p['Final Status'] || '').toLowerCase();
      if (statusLower.includes('return') || statusLower.includes('credit') || statusLower.includes('refund')) {
        isCredit = true;
      } else {
        // In Vendor Ledgers, Credit = Bill Payable
        isBill = true;
      }
    } else if (debit >= credit && debit > 0) {
      isBill = true;
    } else if (credit > debit && credit > 0) {
      isCredit = true;
    } else if (net > 0) {
      isBill = true;
    } else if (net < 0) {
      isCredit = true;
    } else if (outBal !== 0) {
      isBill = outBal > 0;
      isCredit = outBal < 0;
    } else {
      isBill = true;
    }
  }

  let billVal = 0;
  let creditVal = 0;

  if (isBill) {
    billVal = debit !== 0 ? Math.abs(debit) : (credit !== 0 ? Math.abs(credit) : (net !== 0 ? Math.abs(net) : Math.abs(outBal)));
  } else {
    creditVal = credit !== 0 ? Math.abs(credit) : (debit !== 0 ? Math.abs(debit) : (net !== 0 ? Math.abs(net) : Math.abs(outBal)));
  }

  return {
    isBill,
    isCredit,
    isVendorCredit: isCredit,
    billVal,
    creditVal,
    purchaseVal: billVal,
    vendorCreditVal: creditVal,
    returnVal: creditVal,
  };
}
