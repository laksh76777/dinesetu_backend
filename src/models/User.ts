import mongoose, { Schema, Document } from 'mongoose';
import { ROLES, Role } from '../config/constants.js';

export interface IUser extends Document {
  name: string;
  email: string;
  phone?: string;
  role: Role;
  active: boolean;
  station?: string; // Optional for kitchen staff (e.g. 'Main Kitchen', 'Grill')
  avatar?: string;
  firebaseUid?: string;
  passwordHash?: string; // For demo/fallback authentication
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
      default: ROLES.WAITER,
    },
    active: { type: Boolean, default: true },
    station: { type: String, default: '' },
    avatar: { type: String, default: '' },
    firebaseUid: { type: String, default: null },
    passwordHash: { type: String, default: 'dineflow123' },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
