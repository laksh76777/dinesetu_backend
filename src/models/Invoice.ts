import mongoose, { Schema, Document } from 'mongoose';

export interface IInvoiceItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
  orderedBy?: string;
  roundNumber?: number;
}

export interface IInvoice extends Document {
  invoiceNumber: string;
  restaurant: string;
  address: string;
  gstNumber?: string;
  table: string;
  session: mongoose.Types.ObjectId;
  items: IInvoiceItem[];
  quantities: number;
  subtotal: number;
  tax: number;
  taxRate: number;
  serviceCharge: number;
  serviceChargeRate: number;
  total: number;
  paymentMethod: string;
  transactionId: string;
  status: 'PAID' | 'PENDING' | 'CANCELLED';
  splitType: 'FULL' | 'OWN_ITEMS' | 'EQUAL' | 'CUSTOM';
  payerName?: string;
  payerMemberId?: string;
  createdAt: Date;
  paidAt?: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    restaurant: { type: String, required: true },
    address: { type: String, required: true },
    gstNumber: { type: String },
    table: { type: String, required: true },
    session: { type: Schema.Types.ObjectId, ref: 'TableSession', required: true },
    items: [
      {
        name: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        total: { type: Number, required: true },
        orderedBy: { type: String },
        roundNumber: { type: Number },
      },
    ],
    quantities: { type: Number, required: true, default: 0 },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    taxRate: { type: Number, required: true, default: 5 },
    serviceCharge: { type: Number, required: true, default: 0 },
    serviceChargeRate: { type: Number, required: true, default: 5 },
    total: { type: Number, required: true },
    paymentMethod: { type: String, required: true },
    transactionId: { type: String, required: true },
    status: {
      type: String,
      enum: ['PAID', 'PENDING', 'CANCELLED'],
      default: 'PENDING',
    },
    splitType: {
      type: String,
      enum: ['FULL', 'OWN_ITEMS', 'EQUAL', 'CUSTOM'],
      default: 'FULL',
    },
    payerName: { type: String },
    payerMemberId: { type: String },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

export const Invoice =
  (mongoose.models.Invoice as mongoose.Model<IInvoice>) ||
  mongoose.model<IInvoice>('Invoice', InvoiceSchema);
