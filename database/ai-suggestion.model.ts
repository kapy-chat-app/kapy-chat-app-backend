/* eslint-disable @typescript-eslint/no-explicit-any */
// src/database/models/ai-suggestion.model.ts
import mongoose, { Schema, Document, models } from 'mongoose';
import { model } from 'mongoose';

export interface IAISuggestion extends Document {
  user: mongoose.Types.ObjectId; // Ref to User
  suggestion_type: 'emotional_balance' | 'communication_tip' | 'activity_recommendation' | 'wellness_tip';
  title: string;
  content: string;
  priority: 'low' | 'medium' | 'high';
  based_on_emotions: string[]; // emotions that triggered this suggestion
  suggested_actions: {
    action_type: 'message_template' | 'breathing_exercise' | 'music_recommendation' | 'break_reminder' | 'social_activity';
    content: string;
    duration?: number; // minutes
    media?: mongoose.Types.ObjectId; // Ref to File
  }[];
  is_read: boolean;
  is_dismissed: boolean;
  user_feedback?: {
    rating: number; // 1-5
    comment?: string;
    helpful: boolean;
  };
  expires_at?: Date;
  created_at: Date;
  updated_at: Date;
}

const AISuggestionSchema = new Schema<IAISuggestion>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  suggestion_type: {
    type: String,
    enum: ['emotional_balance', 'communication_tip', 'activity_recommendation', 'wellness_tip'],
    required: true
  },
  title: { type: String, required: true },
  content: { type: String, required: true },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  based_on_emotions: [{ type: String }],
  suggested_actions: [{
    action_type: {
      type: String,
      enum: ['message_template', 'breathing_exercise', 'music_recommendation', 'break_reminder', 'social_activity']
    },
    content: { type: String },
    duration: { type: Number },
    media: { type: Schema.Types.ObjectId, ref: 'File' }
  }],
  is_read: { type: Boolean, default: false },
  is_dismissed: { type: Boolean, default: false },
  user_feedback: {
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String },
    helpful: { type: Boolean }
  },
  expires_at: { type: Date },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Indexes
AISuggestionSchema.index({ user: 1, created_at: -1 });
AISuggestionSchema.index({ suggestion_type: 1 });
AISuggestionSchema.index({ priority: 1, is_read: 1 });
AISuggestionSchema.index({ user: 1, is_dismissed: 1, expires_at: 1 });

// Pre-save middleware
AISuggestionSchema.pre('save', function(next) {
  this.updated_at = new Date();
  
  // Set default expiration (7 days from creation)
  if (!this.expires_at && this.isNew) {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7);
    this.expires_at = expirationDate;
  }
  
  next();
});

// Instance methods
AISuggestionSchema.methods.markAsRead = function() {
  this.is_read = true;
  return this.save();
};

AISuggestionSchema.methods.dismiss = function() {
  this.is_dismissed = true;
  return this.save();
};

AISuggestionSchema.methods.addFeedback = function(rating: number, comment?: string, helpful?: boolean) {
  this.user_feedback = {
    rating,
    comment,
    helpful: helpful ?? rating >= 3
  };
  return this.save();
};

// Static methods
AISuggestionSchema.statics.getActiveSuggestions = function(userId: string) {
  return this.find({
    user: userId,
    is_dismissed: false,
    $or: [
      { expires_at: { $gt: new Date() } },
      { expires_at: { $exists: false } }
    ]
  })
  .populate('suggested_actions.media')
  .sort({ priority: -1, created_at: -1 });
};

AISuggestionSchema.statics.getUnreadSuggestions = function(userId: string) {
  return this.find({
    user: userId,
    is_read: false,
    is_dismissed: false,
    $or: [
      { expires_at: { $gt: new Date() } },
      { expires_at: { $exists: false } }
    ]
  })
  .populate('suggested_actions.media')
  .sort({ priority: -1, created_at: -1 });
};

AISuggestionSchema.statics.getSuggestionsByType = function(userId: string, suggestionType: string) {
  return this.find({
    user: userId,
    suggestion_type: suggestionType,
    is_dismissed: false
  })
  .sort({ created_at: -1 })
  .limit(10);
};

AISuggestionSchema.statics.getFeedbackAnalytics = function(userId?: string) {
  const matchStage: any = {
    'user_feedback.rating': { $exists: true }
  };
  
  if (userId) {
    matchStage.user = new mongoose.Types.ObjectId(userId);
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$suggestion_type',
        avg_rating: { $avg: '$user_feedback.rating' },
        total_feedback: { $sum: 1 },
        helpful_count: {
          $sum: {
            $cond: [{ $eq: ['$user_feedback.helpful', true] }, 1, 0]
          }
        }
      }
    },
    {
      $addFields: {
        helpfulness_rate: {
          $divide: ['$helpful_count', '$total_feedback']
        }
      }
    }
  ]);
};

AISuggestionSchema.statics.createSuggestion = async function(data: {
  userId: string;
  suggestionType: string;
  title: string;
  content: string;
  priority?: string;
  basedOnEmotions?: string[];
  suggestedActions?: any[];
  expiresAt?: Date;
}) {
  return this.create({
    user: data.userId,
    suggestion_type: data.suggestionType,
    title: data.title,
    content: data.content,
    priority: data.priority || 'medium',
    based_on_emotions: data.basedOnEmotions || [],
    suggested_actions: data.suggestedActions || [],
    expires_at: data.expiresAt
  });
};

AISuggestionSchema.statics.cleanExpiredSuggestions = function() {
  return this.deleteMany({
    expires_at: { $lt: new Date() },
    is_dismissed: true
  });
};

const AISuggestion = models.AISuggestion || model("AISuggestion", AISuggestionSchema);

export default AISuggestion;