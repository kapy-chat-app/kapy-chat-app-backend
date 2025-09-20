// src/database/models/file.model.ts
import mongoose, { Schema, Document, models, model } from 'mongoose';

export interface IFile extends Document {
  file_name: string;
  file_type: string;
  file_size: number;
  file_path: string;
  url: string;
  created_at: Date;
}

const FileSchema = new Schema<IFile>({
  file_name: { type: String, required: true },
  file_type: { type: String, required: true },
  file_size: { type: Number, required: true },
  file_path: { type: String, required: true },
  url: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

// Indexes
FileSchema.index({ file_type: 1 });
FileSchema.index({ created_at: -1 });
FileSchema.index({ file_name: 1 });

const File = models.File || model("File", FileSchema);

export default File;