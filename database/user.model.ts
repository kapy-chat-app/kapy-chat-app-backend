// src/database/models/user.model.ts - UPDATED with backup fields
import mongoose, { Schema, Document, model } from "mongoose";
import { models } from "mongoose";

// Backup data structure
interface IKeyBackupData {
  encryptedMasterKey: string;
  salt: string;
  iv: string;
  authTag: string;
  keyVersion: number;
  createdAt: string;
}

export interface IUser extends Document {
  clerkId: string;
  email: string;
  full_name: string;
  username: string;
  bio?: string;
  avatar?: mongoose.Types.ObjectId;
  cover_photo?: mongoose.Types.ObjectId;
  phone?: string;
  date_of_birth?: Date;
  gender?: "male" | "female" | "other" | "private";
  location?: string;
  website?: string;
  is_online: boolean;
  last_seen?: Date;
  privacy_settings: {
    profile_visibility: "public" | "friends" | "private";
    phone_visibility: "public" | "friends" | "private";
    email_visibility: "public" | "friends" | "private";
    last_seen_visibility: "everyone" | "friends" | "nobody";
  };
  notification_settings: {
    message_notifications: boolean;
    call_notifications: boolean;
    friend_request_notifications: boolean;
    ai_suggestions_notifications: boolean;
  };
  ai_preferences: {
    enable_behavior_analysis: boolean;
    enable_emotion_suggestions: boolean;
    preferred_suggestion_frequency: "high" | "medium" | "low";
  };
  // Encryption fields
  encryption_public_key?: string;
  encryption_key_uploaded_at?: Date;
  encryption_backup?: IKeyBackupData; // ✅ NEW: Encrypted backup
  encryption_backup_created_at?: Date; // ✅ NEW: Backup timestamp
  status?: string;
  created_at: Date;
  updated_at: Date;
}

const UserSchema = new Schema<IUser>({
  clerkId: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true },
  full_name: { type: String, required: true },
  username: { type: String, required: true, unique: true, index: true },
  bio: { type: String, maxlength: 500 },
  avatar: { type: Schema.Types.ObjectId, ref: "File" },
  cover_photo: { type: Schema.Types.ObjectId, ref: "File" },
  phone: { type: String },
  date_of_birth: { type: Date },
  gender: {
    type: String,
    enum: ["male", "female", "other", "private"],
    default: "private",
  },
  location: { type: String },
  website: { type: String },
  is_online: { type: Boolean, default: false },
  last_seen: { type: Date, default: Date.now },
  privacy_settings: {
    profile_visibility: {
      type: String,
      enum: ["public", "friends", "private"],
      default: "friends",
    },
    phone_visibility: {
      type: String,
      enum: ["public", "friends", "private"],
      default: "private",
    },
    email_visibility: {
      type: String,
      enum: ["public", "friends", "private"],
      default: "private",
    },
    last_seen_visibility: {
      type: String,
      enum: ["everyone", "friends", "nobody"],
      default: "friends",
    },
  },
  notification_settings: {
    message_notifications: { type: Boolean, default: true },
    call_notifications: { type: Boolean, default: true },
    friend_request_notifications: { type: Boolean, default: true },
    ai_suggestions_notifications: { type: Boolean, default: true },
  },
  ai_preferences: {
    enable_behavior_analysis: { type: Boolean, default: true },
    enable_emotion_suggestions: { type: Boolean, default: true },
    preferred_suggestion_frequency: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "medium",
    },
  },
  // Encryption fields
  encryption_public_key: { 
    type: String, 
    default: null,
    index: true,
  },
  encryption_key_uploaded_at: {
    type: Date,
    default: null,
  },
  // ✅ NEW: Encrypted backup storage
  encryption_backup: {
    type: Schema.Types.Mixed, // Stores IKeyBackupData
    default: null,
  },
  encryption_backup_created_at: {
    type: Date,
    default: null,
  },
   encryption_public_key: { 
      type: String, 
      default: null,
      index: true, // ✅ Index for faster queries
    },
    encryption_key_uploaded_at: {
      type: Date,
      default: null,
    },
  status: { type: String, maxlength: 100 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Indexes
UserSchema.index({ clerkId: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ is_online: 1, last_seen: -1 });

// Pre-save middleware
UserSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

const User = models.User || model("User", UserSchema);

export default User;
