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
