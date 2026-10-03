import mongoose, { Schema, Document } from 'mongoose';

export type TableStatus =
  | 'AVAILABLE'
  | 'ACTIVE'
  | 'ORDERING'
  | 'OCCUPIED'
  | 'PREPARING'
  | 'READY'
  | 'SERVING'
  | 'PAYMENT_PENDING'
  | 'PAYMENT';

export interface IQRCode {
  token: string;
  active: boolean;
  generatedAt: Date;
  regeneratedAt?: Date;
  qrDataUrl?: string;
}

export interface ITable extends Document {
  tableNumber: string;
  capacity: number;
  status: TableStatus;
  active: boolean;
  qrCode: IQRCode;
  section: string;
  activeSessionId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const QRCodeSchema = new Schema<IQRCode>(
  {
    token: { type: String, required: true, unique: true, index: true },
    active: { type: Boolean, default: true },
    generatedAt: { type: Date, default: Date.now },
    regeneratedAt: { type: Date },
    qrDataUrl: { type: String },
  },
  { _id: false }
);

const TableSchema = new Schema<ITable>(
  {
    tableNumber: { type: String, required: true, unique: true, trim: true },
    capacity: { type: Number, required: true, default: 4, min: 1 },
    status: {
      type: String,
      enum: [
        'AVAILABLE',
        'ACTIVE',
        'ORDERING',
        'OCCUPIED',
        'PREPARING',
        'READY',
        'SERVING',
        'PAYMENT_PENDING',
        'PAYMENT',
      ],
      default: 'AVAILABLE',
    },
    active: { type: Boolean, default: true },
    qrCode: { type: QRCodeSchema, required: true },
    section: { type: String, default: 'Main Dining Hall' },
    activeSessionId: { type: Schema.Types.ObjectId, ref: 'TableSession', default: null },
  },
  { timestamps: true }
);

export const Table = mongoose.model<ITable>('Table', TableSchema);
