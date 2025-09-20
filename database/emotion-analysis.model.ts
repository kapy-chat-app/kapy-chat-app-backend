/* eslint-disable @typescript-eslint/no-explicit-any */
// src/database/models/emotion-analysis.model.ts
import mongoose, { Schema, Document, models, model } from 'mongoose';

export interface IEmotionAnalysis extends Document {
  user: mongoose.Types.ObjectId; // Ref to User
  message?: mongoose.Types.ObjectId; // Ref to Message
  conversation?: mongoose.Types.ObjectId; // Ref to Conversation
  emotion_scores: {
    joy: number;
    sadness: number;
    anger: number;
    fear: number;
    surprise: number;
    neutral: number;
  };
  dominant_emotion: string;
  confidence_score: number; // 0-1
  text_analyzed?: string;
  audio_features?: {
    tone: string;
    pitch: number;
    speed: number;
    volume: number;
  };
  context: 'message' | 'voice_note' | 'call' | 'general';
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
  analyzed_at: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now }
});

// Indexes
EmotionAnalysisSchema.index({ user: 1, analyzed_at: -1 });
EmotionAnalysisSchema.index({ dominant_emotion: 1 });
EmotionAnalysisSchema.index({ conversation: 1 });
EmotionAnalysisSchema.index({ user: 1, context: 1, analyzed_at: -1 });

// Validation
EmotionAnalysisSchema.pre('save', function(next) {
  // Ensure emotion scores sum to approximately 1
  const totalScore = Object.values(this.emotion_scores).reduce((sum, score) => sum + score, 0);
  if (Math.abs(totalScore - 1) > 0.1) {
    return next(new Error('Emotion scores must sum to approximately 1'));
  }
  
  // Validate dominant emotion matches highest score
  const emotions = Object.entries(this.emotion_scores);
  const highestEmotion = emotions.reduce((max, [emotion, score]) => 
    score > max.score ? { emotion, score } : max, 
    { emotion: '', score: 0 }
  );
  
  if (this.dominant_emotion !== highestEmotion.emotion) {
    this.dominant_emotion = highestEmotion.emotion;
  }
  
  next();
});

// Static methods
EmotionAnalysisSchema.statics.getUserEmotionTrends = function(userId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        analyzed_at: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          emotion: '$dominant_emotion',
          date: { $dateToString: { format: '%Y-%m-%d', date: '$analyzed_at' } }
        },
        count: { $sum: 1 },
        avg_confidence: { $avg: '$confidence_score' },
        avg_joy: { $avg: '$emotion_scores.joy' },
        avg_sadness: { $avg: '$emotion_scores.sadness' },
        avg_anger: { $avg: '$emotion_scores.anger' },
        avg_fear: { $avg: '$emotion_scores.fear' }
      }
    },
    {
      $sort: { '_id.date': 1 }
    }
  ]);
};

EmotionAnalysisSchema.statics.getConversationEmotionSummary = function(conversationId: string, days: number = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        conversation: new mongoose.Types.ObjectId(conversationId),
        analyzed_at: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$user',
        dominant_emotions: { $push: '$dominant_emotion' },
        avg_joy: { $avg: '$emotion_scores.joy' },
        avg_sadness: { $avg: '$emotion_scores.sadness' },
        avg_anger: { $avg: '$emotion_scores.anger' },
        avg_confidence: { $avg: '$confidence_score' },
        total_analyses: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user_info'
      }
    }
  ]);
};

EmotionAnalysisSchema.statics.detectEmotionalPatterns = function(userId: string) {
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId)
      }
    },
    {
      $addFields: {
        hour: { $hour: '$analyzed_at' },
        dayOfWeek: { $dayOfWeek: '$analyzed_at' }
      }
    },
    {
      $group: {
        _id: {
          emotion: '$dominant_emotion',
          hour: '$hour',
          dayOfWeek: '$dayOfWeek'
        },
        count: { $sum: 1 },
        avg_confidence: { $avg: '$confidence_score' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

EmotionAnalysisSchema.statics.createEmotionAnalysis = async function(data: {
  userId: string;
  messageId?: string;
  conversationId?: string;
  emotionScores: any;
  textAnalyzed?: string;
  audioFeatures?: any;
  context: string;
}) {
  // Calculate dominant emotion
  const emotions = Object.entries(data.emotionScores);
  const dominantEmotion = emotions.reduce((max, [emotion, score]) => 
    (score as number) > max.score ? { emotion, score: score as number } : max, 
    { emotion: '', score: 0 }
  );
  
  return this.create({
    user: data.userId,
    message: data.messageId,
    conversation: data.conversationId,
    emotion_scores: data.emotionScores,
    dominant_emotion: dominantEmotion.emotion,
    confidence_score: dominantEmotion.score,
    text_analyzed: data.textAnalyzed,
    audio_features: data.audioFeatures,
    context: data.context
  });
};

const EmotionAnalysis = models.EmotionAnalysis || model("EmotionAnalysis", EmotionAnalysisSchema);

export default EmotionAnalysis;