import mongoose, { Schema, Document } from 'mongoose';
import {
  STAFF_REQUEST_TYPES,
  StaffRequestType,
  STAFF_REQUEST_STATUSES,
  StaffRequestStatus,
} from '../config/constants.js';

export interface IStaffRequest extends Document {
  session: mongoose.Types.ObjectId;
  tableNumber: string;
  memberId?: string;
  memberName?: string;
  requestType: StaffRequestType;
  notes?: string;
  status: StaffRequestStatus;
  handledByStaffId?: mongoose.Types.ObjectId;
  handledByStaffName?: string;
  requestedAt: Date;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StaffRequestSchema = new Schema<IStaffRequest>(
  {
    session: { type: Schema.Types.ObjectId, ref: 'TableSession', required: true },
    tableNumber: { type: String, required: true },
    memberId: { type: String },
    memberName: { type: String },
    requestType: {
      type: String,
      enum: Object.values(STAFF_REQUEST_TYPES),
      required: true,
    },
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: Object.values(STAFF_REQUEST_STATUSES),
      default: STAFF_REQUEST_STATUSES.REQUESTED,
    },
    handledByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    handledByStaffName: { type: String },
    requestedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

export const StaffRequest =
  (mongoose.models.StaffRequest as mongoose.Model<IStaffRequest>) ||
  mongoose.model<IStaffRequest>('StaffRequest', StaffRequestSchema);
