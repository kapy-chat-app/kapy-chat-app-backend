/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Schema, Document, models, model } from 'mongoose';

export interface IAIChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  emotion_detected?: string;
  emotion_confidence?: number;
  language?: 'vi' | 'en' | 'zh';
  timestamp: Date;
}

export interface IAIChatHistory extends Document {
  user: mongoose.Types.ObjectId;
  conversation_id: string;
  title?: string; // Tự động generate từ tin nhắn đầu
  messages: IAIChatMessage[];
  emotion_context?: {
    dominant_emotion: string;
    recent_emotions: string[];
    avg_confidence: number;
  };
  metadata?: {
    total_messages: number;
    language_preference: 'vi' | 'en' | 'zh';
    last_emotion_alert?: Date;
    tags?: string[];
  };
  created_at: Date;
  updated_at: Date;
}

const AIChatHistorySchema = new Schema<IAIChatHistory>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  conversation_id: { type: String, required: true, unique: true },
  title: { type: String },
  messages: [{
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    emotion_detected: { type: String },
    emotion_confidence: { type: Number, min: 0, max: 1 },
    language: { type: String, enum: ['vi', 'en', 'zh'] },
    timestamp: { type: Date, default: Date.now }
  }],
  emotion_context: {
    dominant_emotion: { type: String },
    recent_emotions: [{ type: String }],
    avg_confidence: { type: Number }
  },
  metadata: {
    total_messages: { type: Number, default: 0 },
    language_preference: { type: String, enum: ['vi', 'en', 'zh'], default: 'vi' },
    last_emotion_alert: { type: Date },
    tags: [{ type: String }]
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Indexes
AIChatHistorySchema.index({ user: 1, updated_at: -1 });
AIChatHistorySchema.index({ conversation_id: 1 });
AIChatHistorySchema.index({ user: 1, 'metadata.language_preference': 1 });

// Auto update total_messages
AIChatHistorySchema.pre('save', function(next) {
  if (this.messages) {
    this.metadata = this.metadata || {};
    this.metadata.total_messages = this.messages.length;
  }
  this.updated_at = new Date();
  next();
});

const AIChatHistory = models.AIChatHistory || model("AIChatHistory", AIChatHistorySchema);

export default AIChatHistory;