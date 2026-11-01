import type { OcrSuggestion } from "./ocr";
export type Customer = {
  id: string;
  name: string;
  taxId: string;
  phone: string;
  email: string;
  address: string;
};
export type Supplier = {
  id: string;
  name: string;
  taxId: string;
  phone: string;
  email: string;
  contact: string;
  terms: string;
};
export type Worker = {
  id: string;
  name: string;
  hourlyCost?: string;
  specialty?: string;
};
export type Cost = {
  id: string;
  type: string;
  description: string;
  amount: string;
  documentId?: string;
};
export type Hours = {
  id: string;
  hours: string;
  date: string;
  activity: string;
  notes: string;
  billable?: boolean;
  worker?: Worker;
};
export type Quote = {
  id: string;
  name: string;
  cost: string;
  net: string;
  plannedHours: string;
  approved: boolean;
};
export type Sale = {
  id: string;
  jobId: string;
  number: string;
  description: string;
  date: string;
  net: string;
  tax: string;
  withholding: string;
  collected: string;
  dueAt?: string;
  jobName?: string;
};
export type Metrics = {
  net: string;
  direct: string;
  overhead: string;
  gross: string;
  operating: string;
  margin: string | null;
  hours: string;
  labor: string;
  collected: string;
  pending: string;
  perHour: string | null;
};
export type Job = {
  id: string;
  number: string;
  name: string;
  customer: Customer;
  worker?: Worker;
  address: string;
  service: string;
  status: string;
  plannedAt?: string;
  hours: Hours[];
  costs: Cost[];
  sales: Sale[];
  quotes: Quote[];
  metrics?: Metrics;
  pendingStockCosts?: number;
};
export type Doc = {
  stockLots?: {
    id: string;
    code: string;
    description: string;
    reference: string;
    unit: string;
    received: string;
    invoiceDocumentId?: string | null;
  }[];
  valuedLots?: { document: { id: string; number: string | null } }[];
  suggestion?: OcrSuggestion;
  id: string;
  originalName: string;
  mime?: string;
  kind: string;
  status: string;
  text?: string;
  error?: string;
  createdAt: string;
  jobId?: string;
  supplierId?: string;
  supplier?: Supplier;
  number?: string;
  net?: string;
  tax?: string;
  replacedBy?: { id: string };
};
export type State = {
  user: { id: string; name: string; role: string; workerId?: string };
  company: { name: string; taxId?: string };
  jobs: Job[];
  customers: Customer[];
  suppliers: Supplier[];
  workers: Worker[];
  documents: Doc[];
  sales: Sale[];
  overheads: {
    id: string;
    description: string;
    amount: string;
    date: string;
  }[];
  audits: { id: string; action: string; createdAt: string }[];
  users?: {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    workerId?: string;
  }[];
};
