import mongoose, { Schema, Document } from 'mongoose';
import {
  PAYMENT_METHODS,
  PaymentMethod,
} from '../config/constants.js';

export type DemoPaymentStatus = 'CREATED' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export interface IPayment extends Document {
  session: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  tableNumber: string;
  amount: number;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  currency: string;
  method: PaymentMethod;
  paymentMethod: PaymentMethod;
  status: DemoPaymentStatus;
  transactionId: string;
  demoTransactionId: string;
  invoiceId?: mongoose.Types.ObjectId;
  splitType?: 'FULL' | 'OWN_ITEMS' | 'EQUAL' | 'CUSTOM';
  payerName: string;
  payerMemberId?: string;
  customerMemberId?: string;
  paymentDetails?: {
    upiVpa?: string;
    cardLast4?: string;
    bankName?: string;
    accountHolder?: string;
  };
  failureReason?: string;
  createdAt: Date;
  completedAt?: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    session: { type: Schema.Types.ObjectId, ref: 'TableSession', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'TableSession' },
    tableNumber: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, default: 0 },
    tax: { type: Number, required: true, default: 0 },
    serviceCharge: { type: Number, required: true, default: 0 },
    currency: { type: String, default: '₹' },
    method: {
      type: String,
      enum: Object.values(PAYMENT_METHODS),
      required: true,
      default: 'UPI',
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PAYMENT_METHODS),
      default: 'UPI',
    },
    status: {
      type: String,
      enum: ['CREATED', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED'],
      default: 'CREATED',
      index: true,
    },
    transactionId: { type: String, required: true, unique: true },
    demoTransactionId: { type: String, required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    splitType: {
      type: String,
      enum: ['FULL', 'OWN_ITEMS', 'EQUAL', 'CUSTOM'],
      default: 'FULL',
    },
    payerName: { type: String, required: true, default: 'Guest' },
    payerMemberId: { type: String },
    customerMemberId: { type: String },
    paymentDetails: {
      upiVpa: { type: String },
      cardLast4: { type: String },
      bankName: { type: String },
      accountHolder: { type: String },
    },
    failureReason: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

// Virtuals / hooks to keep session/sessionId and method/paymentMethod synchronized
PaymentSchema.pre('save', function (next) {
  if (this.session && !this.sessionId) {
    this.sessionId = this.session;
  } else if (this.sessionId && !this.session) {
    this.session = this.sessionId;
  }

  if (this.method && !this.paymentMethod) {
    this.paymentMethod = this.method;
  } else if (this.paymentMethod && !this.method) {
    this.method = this.paymentMethod;
  }

  if (this.transactionId && !this.demoTransactionId) {
    this.demoTransactionId = this.transactionId;
  } else if (this.demoTransactionId && !this.transactionId) {
    this.transactionId = this.demoTransactionId;
  }

  if (this.payerMemberId && !this.customerMemberId) {
    this.customerMemberId = this.payerMemberId;
  } else if (this.customerMemberId && !this.payerMemberId) {
    this.payerMemberId = this.customerMemberId;
  }

  next();
});

export const Payment =
  (mongoose.models.Payment as mongoose.Model<IPayment>) ||
  mongoose.model<IPayment>('Payment', PaymentSchema);
