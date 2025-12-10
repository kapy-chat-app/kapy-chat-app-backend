/* eslint-disable @typescript-eslint/no-explicit-any */
// src/database/models/emotion-analysis.model.ts - UPDATED
import mongoose, { Schema, Document, models, model } from 'mongoose';

export interface IEmotionAnalysis extends Document {
  user: mongoose.Types.ObjectId;
  message?: mongoose.Types.ObjectId;
  conversation?: mongoose.Types.ObjectId;
  emotion_scores: {
    joy: number;
    sadness: number;
    anger: number;
    fear: number;
    surprise: number;
    neutral: number;
  };
  dominant_emotion: string;
  confidence_score: number;
  text_analyzed?: string;
  audio_features?: {
    tone: string;
    pitch: number;
    speed: number;
    volume: number;
  };
  context: 'message' | 'voice_note' | 'call' | 'general';
  metadata?: {
    is_toxic?: boolean;
    toxicity_score?: number;
    is_sender?: boolean;
    analyzed_on?: 'client' | 'server';
    analyzed_at?: Date;
  };
  analyzed_at: Date;
  created_at: Date;
}

const EmotionAnalysisSchema = new Schema<IEmotionAnalysis>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: Schema.Types.ObjectId, ref: 'Message' },
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  emotion_scores: {
    joy: { type: Number, min: 0, max: 1, default: 0 },
    sadness: { type: Number, min: 0, max: 1, default: 0 },
    anger: { type: Number, min: 0, max: 1, default: 0 },
    fear: { type: Number, min: 0, max: 1, default: 0 },
    surprise: { type: Number, min: 0, max: 1, default: 0 },
    neutral: { type: Number, min: 0, max: 1, default: 0 }
  },
  dominant_emotion: { type: String, required: true },
  confidence_score: { type: Number, min: 0, max: 1, required: true },
  text_analyzed: { type: String },
  audio_features: {
    tone: { type: String },
    pitch: { type: Number },
    speed: { type: Number },
    volume: { type: Number }
  },
  context: {
    type: String,
    enum: ['message', 'voice_note', 'call', 'general'],
    required: true
  },
  metadata: {
    is_toxic: { type: Boolean },
    toxicity_score: { type: Number, min: 0, max: 100 },
    is_sender: { type: Boolean },
    analyzed_on: { type: String, enum: ['client', 'server'] },
    analyzed_at: { type: Date }
  },
  analyzed_at: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now }
});

// Indexes
EmotionAnalysisSchema.index({ user: 1, analyzed_at: -1 });
EmotionAnalysisSchema.index({ dominant_emotion: 1 });
EmotionAnalysisSchema.index({ conversation: 1 });
EmotionAnalysisSchema.index({ user: 1, context: 1, analyzed_at: -1 });

// ❌ REMOVED: Pre-save validation (client đã validate)

const EmotionAnalysis = models.EmotionAnalysis || model("EmotionAnalysis", EmotionAnalysisSchema);

export default EmotionAnalysis;