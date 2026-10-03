import mongoose, { Schema, Document } from 'mongoose';

export interface ISessionMember extends Document {
  sessionId: mongoose.Types.ObjectId;
  displayName: string;
  temporaryMemberId: string;
  joinedAt: Date;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SessionMemberSchema = new Schema<ISessionMember>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'TableSession', required: true, index: true },
    displayName: { type: String, required: true, trim: true },
    temporaryMemberId: { type: String, required: true, index: true },
    joinedAt: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const SessionMember = mongoose.model<ISessionMember>('SessionMember', SessionMemberSchema);
