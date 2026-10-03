import mongoose, { Schema, Document } from 'mongoose';

export type AnalyticsEventType =
  | 'QR_SCAN'
  | 'SESSION_STARTED'
  | 'SESSION_JOINED'
  | 'MENU_VIEW'
  | 'ITEM_VIEW'
  | 'ADD_TO_CART'
  | 'ORDER_CREATED'
  | 'ORDER_COMPLETED'
  | 'PAYMENT_SUCCESS'
  | 'SESSION_COMPLETED'
  | 'STAFF_REQUEST';

export interface IAnalyticsEvent extends Document {
  eventType: AnalyticsEventType | string;
  sessionId?: string;
  tableNumber?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    eventType: { type: String, required: true, index: true },
    sessionId: { type: String, index: true },
    tableNumber: { type: String },
    metadata: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

export const AnalyticsEvent =
  (mongoose.models.AnalyticsEvent as mongoose.Model<IAnalyticsEvent>) ||
  mongoose.model<IAnalyticsEvent>('AnalyticsEvent', AnalyticsEventSchema);
