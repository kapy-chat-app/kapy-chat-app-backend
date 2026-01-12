/* eslint-disable @typescript-eslint/no-explicit-any */
// database/ai-chat-history.model.ts - COMPLETE SCHEMA

import mongoose, { Document, Schema } from "mongoose";

export interface IAIChatHistory extends Document {
  user: mongoose.Types.ObjectId;
  conversation_id: string;
  title?: string; // ✅ THÊM
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: Date;
    language?: string;
    emotion_detected?: string;
  }>;
  emotion_context?: {
    dominant_emotion: string;
    recent_emotions: string[];
    avg_confidence: number;
  };
  metadata?: {
    language_preference?: "vi" | "en" | "zh";
    [key: string]: any;
  };
  created_at: Date;
  updated_at: Date;
}

const AIChatHistorySchema = new Schema<IAIChatHistory>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    conversation_id: {
      type: String,
      required: true,
      unique: true,
      index: true, // ✅ Index cho performance
    },
    // ✅ THÊM FIELD TITLE
    title: {
      type: String,
      default: null,
      maxlength: 200,
    },
    messages: [
      {
        role: {
          type: String,
          enum: ["user", "assistant", "system"],
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        language: {
          type: String,
          enum: ["vi", "en", "zh"],
        },
        emotion_detected: {
          type: String,
        },
      },
    ],
    // ✅ THÊM EMOTION CONTEXT
    emotion_context: {
      dominant_emotion: String,
      recent_emotions: [String],
      avg_confidence: Number,
    },
    // ✅ THÊM METADATA
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
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

// ✅ Indexes for performance
AIChatHistorySchema.index({ user: 1, updated_at: -1 });
AIChatHistorySchema.index({ user: 1, conversation_id: 1 }, { unique: true });

const AIChatHistory =
  mongoose.models.AIChatHistory ||
  mongoose.model<IAIChatHistory>("AIChatHistory", AIChatHistorySchema);

export default AIChatHistory;
