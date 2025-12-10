// src/database/models/file.model.ts - FIXED for Per-Recipient Encryption

import mongoose, { Schema, Document, models, model } from "mongoose";

// ✅ NEW: Per-recipient encrypted key
export interface IRecipientKey {
  userId: string;                    // Clerk ID của recipient
  encryptedSymmetricKey: string;     // Symmetric key được encrypt bằng public key của user
  keyIv: string;                     // IV dùng để encrypt symmetric key
  keyAuthTag: string;                // Auth tag cho encryption của symmetric key
}

export interface IFile extends Document {
  file_name: string;
  file_type: string;
  file_size: number;
  file_path: string;
  url: string;
  cloudinary_public_id?: string;
  uploaded_by?: mongoose.Types.ObjectId;
  created_at: Date;

  // ✨ E2EE fields
  is_encrypted?: boolean;
  encryption_metadata?: {
    iv: string;                      // File encryption IV (master)
    authTag: string;                 // File auth tag (master)
    original_size: number;
    encrypted_size: number;
    
    // ✅ NEW: Per-recipient encrypted symmetric keys
    recipientKeys?: IRecipientKey[];
    
    // Chunk info (cho streaming)
    chunks?: Array<{
      index: number;
      iv: string;
      authTag: string;
      gcmAuthTag: string;
      originalSize: number;
      encryptedSize: number;
    }>;
    totalChunks?: number;
    fileId?: string;
  };

  thumbnail_url?: string;
}

const RecipientKeySchema = new Schema({
  userId: { type: String, required: true, index: true },
  encryptedSymmetricKey: { type: String, required: true },
  keyIv: { type: String, required: true },
  keyAuthTag: { type: String, required: true },
}, { _id: false });

const FileSchema = new Schema<IFile>(
  {
    file_name: {
      type: String,
      required: true,
    },
    file_type: {
      type: String,
      required: true,
    },
    file_size: {
      type: Number,
      required: true,
    },
    file_path: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    cloudinary_public_id: {
      type: String,
      required: false,
    },
    uploaded_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },

    // ✨ E2EE fields
    is_encrypted: {
      type: Boolean,
      default: false,
    },
    encryption_metadata: {
      iv: { type: String },
      authTag: { type: String },
      original_size: { type: Number },
      encrypted_size: { type: Number },
      
      // ✅ NEW: Array of recipient-specific encrypted keys
      recipientKeys: [RecipientKeySchema],
      
      chunks: [
        {
          index: { type: Number, required: true },
          iv: { type: String, required: true },
          authTag: { type: String, required: true },
          gcmAuthTag: { type: String, required: true },
          originalSize: { type: Number, required: true },
          encryptedSize: { type: Number, required: true },
        },
      ],
      totalChunks: { type: Number },
      fileId: { type: String },
    },

    thumbnail_url: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
FileSchema.index({ file_type: 1 });
FileSchema.index({ created_at: -1 });
FileSchema.index({ file_name: 1 });
FileSchema.index({ is_encrypted: 1 });
FileSchema.index({ uploaded_by: 1 });
FileSchema.index({ cloudinary_public_id: 1 });
FileSchema.index({ "encryption_metadata.fileId": 1 });
FileSchema.index({ "encryption_metadata.recipientKeys.userId": 1 });
FileSchema.index({ thumbnail_url: 1 });

// ✅ Get encrypted key for specific user
FileSchema.methods.getRecipientKey = function (clerkId: string) {
  if (!this.encryption_metadata?.recipientKeys) return null;
  
  return this.encryption_metadata.recipientKeys.find(
    (rk: IRecipientKey) => rk.userId === clerkId
  );
};

// ✅ Check if user can decrypt this file
FileSchema.methods.canDecrypt = function (clerkId: string): boolean {
  if (!this.is_encrypted || !this.encryption_metadata?.recipientKeys) {
    return true; // Unencrypted file
  }
  
  return this.encryption_metadata.recipientKeys.some(
    (rk: IRecipientKey) => rk.userId === clerkId
  );
};

// ✅ Check if file uses chunked encryption
FileSchema.methods.isChunkedEncryption = function (): boolean {
  return (
    this.is_encrypted &&
    this.encryption_metadata?.chunks !== undefined &&
    Array.isArray(this.encryption_metadata.chunks) &&
    this.encryption_metadata.chunks.length > 1
  );
};

// ✅ Get total chunks
FileSchema.methods.getTotalChunks = function (): number {
  if (
    this.encryption_metadata?.chunks &&
    Array.isArray(this.encryption_metadata.chunks)
  ) {
    return this.encryption_metadata.chunks.length;
  }
  return this.encryption_metadata?.totalChunks || 0;
};

const File = models.File || model<IFile>("File", FileSchema);

export default File;