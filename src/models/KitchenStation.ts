import mongoose, { Schema, Document } from 'mongoose';
import { KITCHEN_STATIONS, KitchenStation } from '../config/constants.js';

export interface IKitchenStation extends Document {
  name: KitchenStation;
  code: string;
  description: string;
  color: string;
  displayOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const KitchenStationSchema = new Schema<IKitchenStation>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      enum: Object.values(KITCHEN_STATIONS),
    },
    code: { type: String, required: true, unique: true, uppercase: true },
    description: { type: String, default: '' },
    color: { type: String, default: '#f59e0b' },
    displayOrder: { type: Number, default: 1 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const KitchenStationModel =
  (mongoose.models.KitchenStation as mongoose.Model<IKitchenStation>) ||
  mongoose.model<IKitchenStation>('KitchenStation', KitchenStationSchema);
