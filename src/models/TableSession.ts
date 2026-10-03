import mongoose, { Schema, Document } from 'mongoose';

export type SessionStatus = 'ACTIVE' | 'PAYMENT_PENDING' | 'COMPLETED';
export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID';

export interface ITableIdeaItem {
  id: string;
  menuItemId: mongoose.Types.ObjectId;
  name: string;
  price: number;
  image: string;
  foodType: string;
  addedBy: string;
  addedAt: Date;
}

export interface IDiningPreferences {
  vegetarian?: boolean;
  spicy?: boolean;
  light?: boolean;
  filling?: boolean;
  budgetFriendly?: boolean;
  chefsPick?: boolean;
}

export type DiningStage = 'DISCOVERY' | 'STARTERS' | 'MAIN_COURSE' | 'DESSERT' | 'BILL';

export interface ITableSession extends Document {
  tableId: mongoose.Types.ObjectId;
  tableNumber: string;
  sessionNumber: string; // e.g. #8291
  status: SessionStatus;
  startedAt: Date;
  endedAt?: Date | null;
  memberCount: number;
  paymentStatus: PaymentStatus;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  totalAmount: number;
  tableIdeas: ITableIdeaItem[];
  preferences: IDiningPreferences;
  diningStage: DiningStage;
  createdAt: Date;
  updatedAt: Date;
}

const TableIdeaItemSchema = new Schema<ITableIdeaItem>(
  {
    id: { type: String, required: true },
    menuItemId: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, default: '' },
    foodType: { type: String, default: 'VEG' },
    addedBy: { type: String, default: 'Guest' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const DiningPreferencesSchema = new Schema<IDiningPreferences>(
  {
    vegetarian: { type: Boolean, default: false },
    spicy: { type: Boolean, default: false },
    light: { type: Boolean, default: false },
    filling: { type: Boolean, default: false },
    budgetFriendly: { type: Boolean, default: false },
    chefsPick: { type: Boolean, default: false },
  },
  { _id: false }
);

const TableSessionSchema = new Schema<ITableSession>(
  {
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', required: true, index: true },
    tableNumber: { type: String, required: true },
    sessionNumber: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAYMENT_PENDING', 'COMPLETED'],
      default: 'ACTIVE',
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    memberCount: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'PENDING', 'PAID'],
      default: 'UNPAID',
    },
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    serviceCharge: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    tableIdeas: { type: [TableIdeaItemSchema], default: [] },
    preferences: { type: DiningPreferencesSchema, default: () => ({}) },
    diningStage: {
      type: String,
      enum: ['DISCOVERY', 'STARTERS', 'MAIN_COURSE', 'DESSERT', 'BILL'],
      default: 'DISCOVERY',
    },
  },
  { timestamps: true }
);

export const TableSession = mongoose.model<ITableSession>('TableSession', TableSessionSchema);
