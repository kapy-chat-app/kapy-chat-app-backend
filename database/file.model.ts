// src/database/models/file.model.ts - UPDATED FOR CLOUDINARY E2EE

import mongoose, { Schema, Document, models, model } from 'mongoose';

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
  // ❌ REMOVED: encrypted_data - Không lưu trong DB nữa
  encryption_metadata?: {
    iv: string;
    authTag: string;
    original_size: number;
    encrypted_size: number;
  };
}

const FileSchema = new Schema<IFile>({
  file_name: { 
    type: String, 
    required: true 
  },
  file_type: { 
    type: String, 
    required: true 
  },
  file_size: { 
    type: Number, 
    required: true 
  },
  file_path: { 
    type: String, 
    required: true 
  },
  url: { 
    type: String, 
    required: true 
  },
  cloudinary_public_id: {
    type: String,
    required: false,
  },
  uploaded_by: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  created_at: { 
    type: Date, 
    default: Date.now 
  },
  
  // ✨ E2EE fields
  is_encrypted: { 
    type: Boolean, 
    default: false 
  },
  // ✅ CHỈ LƯU METADATA - File thật nằm trên Cloudinary
  encryption_metadata: {
    iv: { type: String },
    authTag: { type: String },
    original_size: { type: Number },
    encrypted_size: { type: Number },
  },
}, {
  timestamps: true,
});

// Indexes
FileSchema.index({ file_type: 1 });
FileSchema.index({ created_at: -1 });
FileSchema.index({ file_name: 1 });
FileSchema.index({ is_encrypted: 1 });
FileSchema.index({ uploaded_by: 1 });
FileSchema.index({ cloudinary_public_id: 1 });

const File = models.File || model<IFile>("File", FileSchema);

export default File;