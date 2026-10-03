import mongoose, { Schema, Document } from 'mongoose';

export interface IDiningMoment extends Document {
  title: string;
  badge: string;
  description: string;
  image: string;
  menuItemIds: mongoose.Types.ObjectId[];
  startTime?: Date;
  endTime?: Date;
  active: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const DiningMomentSchema = new Schema<IDiningMoment>(
  {
    title: { type: String, required: true, trim: true },
    badge: { type: String, default: "Tonight's Special" },
    description: { type: String, default: '' },
    image: {
      type: String,
      default: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80',
    },
    menuItemIds: [{ type: Schema.Types.ObjectId, ref: 'MenuItem' }],
    startTime: { type: Date },
    endTime: { type: Date },
    active: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const DiningMoment = mongoose.model<IDiningMoment>('DiningMoment', DiningMomentSchema);
