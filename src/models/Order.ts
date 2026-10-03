import mongoose, { Schema, Document } from 'mongoose';
import {
  ORDER_STATUSES,
  OrderStatus,
  KITCHEN_STATIONS,
  KitchenStation,
} from '../config/constants.js';

export interface IOrderItem {
  _id?: mongoose.Types.ObjectId;
  menuItem: mongoose.Types.ObjectId;
  name: string;
  priceSnapshot: number; // Historical price at the moment order is placed
  quantity: number;
  sessionMemberId: string;
  sessionMemberName: string;
  session?: mongoose.Types.ObjectId;
  notes?: string;
  kitchenStation: KitchenStation;
  status: OrderStatus;
  preparedAt?: Date;
  servedAt?: Date;
}

export interface IOrder extends Document {
  session: mongoose.Types.ObjectId;
  table: mongoose.Types.ObjectId;
  tableNumber: string;
  roundNumber: number;
  status: OrderStatus;
  items: IOrderItem[];
  placedByMemberId: string;
  placedByMemberName: string;
  acceptedAt?: Date;
  preparingAt?: Date;
  readyAt?: Date;
  servedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type IOrderRound = IOrder;

const OrderItemSchema = new Schema<IOrderItem>(
  {
    menuItem: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },
    priceSnapshot: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    sessionMemberId: { type: String, required: true },
    sessionMemberName: { type: String, required: true },
    session: { type: Schema.Types.ObjectId, ref: 'TableSession' },
    notes: { type: String, default: '' },
    kitchenStation: {
      type: String,
      enum: Object.values(KITCHEN_STATIONS),
      default: KITCHEN_STATIONS.MAIN_KITCHEN,
    },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUSES),
      default: ORDER_STATUSES.PLACED,
    },
    preparedAt: { type: Date },
    servedAt: { type: Date },
  },
  { _id: true }
);

const OrderSchema = new Schema<IOrder>(
  {
    session: { type: Schema.Types.ObjectId, ref: 'TableSession', required: true },
    table: { type: Schema.Types.ObjectId, ref: 'Table', required: true },
    tableNumber: { type: String, required: true },
    roundNumber: { type: Number, required: true, default: 1 },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUSES),
      default: ORDER_STATUSES.PLACED,
    },
    items: [OrderItemSchema],
    placedByMemberId: { type: String, required: true },
    placedByMemberName: { type: String, required: true },
    acceptedAt: { type: Date },
    preparingAt: { type: Date },
    readyAt: { type: Date },
    servedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
  },
  { timestamps: true }
);

export const Order =
  (mongoose.models.Order as mongoose.Model<IOrder>) || mongoose.model<IOrder>('Order', OrderSchema);
export const OrderRound =
  (mongoose.models.OrderRound as mongoose.Model<IOrder>) || mongoose.model<IOrder>('OrderRound', OrderSchema);
export const OrderItem =
  (mongoose.models.OrderItem as mongoose.Model<IOrderItem>) || mongoose.model<IOrderItem>('OrderItem', OrderItemSchema);

