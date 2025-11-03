// src/database/models/file.model.ts - UPDATED
import mongoose, { Schema, Document, models, model } from 'mongoose';

export interface IFile extends Document {
  file_name: string;
  file_type: string;
  file_size: number;
  file_path: string;
  url: string;
  created_at: Date;
  
  // ✨ NEW: E2EE fields (optional - backward compatible)
  is_encrypted?: boolean;
  encryption_metadata?: {
    iv: string; // Initialization Vector
    auth_tag: string; // HMAC for integrity verification
    original_size: number; // Size before encryption
    encrypted_size: number; // Size after encryption
  };
}

const FileSchema = new Schema<IFile>({
  file_name: { type: String, required: true },
  file_type: { type: String, required: true },
  file_size: { type: Number, required: true },
  file_path: { type: String, required: true },
  url: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  
  // ✨ NEW: E2EE fields (optional)
  is_encrypted: { type: Boolean, default: false },
  encryption_metadata: {
    iv: { type: String },
    auth_tag: { type: String },
    original_size: { type: Number },
    encrypted_size: { type: Number },
  },
});

// Indexes (giữ nguyên + thêm mới)
FileSchema.index({ file_type: 1 });
FileSchema.index({ created_at: -1 });
FileSchema.index({ file_name: 1 });
FileSchema.index({ is_encrypted: 1 }); // ✨ NEW

const File = models.File || model("File", FileSchema);

export default File;