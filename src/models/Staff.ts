import mongoose, { Schema, Document } from 'mongoose';
import { ROLES, Role } from '../config/constants.js';

export interface IStaff extends Document {
  name: string;
  email: string;
  role: Role;
  station?: string; // Optional for kitchen staff
  active: boolean;
  avatar?: string;
  pin: string; // 4-digit PIN for quick terminal switch
  firebaseUid?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StaffSchema = new Schema<IStaff>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
    },
    station: { type: String },
    active: { type: Boolean, default: true },
    avatar: { type: String },
    pin: { type: String, default: '1234' },
    firebaseUid: { type: String },
  },
  { timestamps: true }
);

export const Staff = mongoose.model<IStaff>('Staff', StaffSchema);
