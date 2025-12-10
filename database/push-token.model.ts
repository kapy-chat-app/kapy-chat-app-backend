import { Schema, model, models, Document } from "mongoose";

export interface IPushToken extends Document {
  _id: string;
  user: Schema.Types.ObjectId; // Reference to User model
  token: string; // Expo push token
  platform: "ios" | "android" | "web";
  device_name?: string;
  device_id?: string;
  is_active: boolean;
  last_used: Date;
  created_at: Date;
  updated_at: Date;
}

const PushTokenSchema = new Schema<IPushToken>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    platform: {
      type: String,
      enum: ["ios", "android", "web"],
      required: true,
    },
    device_name: {
      type: String,
    },
    device_id: {
      type: String,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    last_used: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

// Index for faster queries
PushTokenSchema.index({ user: 1, is_active: 1 });
PushTokenSchema.index({ token: 1 });

const PushToken = models.PushToken || model<IPushToken>("PushToken", PushTokenSchema);

export default PushToken;
