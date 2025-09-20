/* eslint-disable @typescript-eslint/no-explicit-any */
// src/database/models/user-behavior.model.ts
import mongoose, { Schema, Document, models } from 'mongoose';
import { model } from 'mongoose';

export interface IUserBehavior extends Document {
  user: mongoose.Types.ObjectId; // Ref to User
  session_id: string;
  activity_type: 'message_sent' | 'message_received' | 'call_made' | 'call_received' | 'online' | 'offline' | 'typing' | 'voice_note' | 'file_share';
  conversation?: mongoose.Types.ObjectId; // Ref to Conversation
  metadata: {
    message_length?: number;
    response_time?: number; // milliseconds
    emotion_detected?: string;
    call_duration?: number;
    file_type?: string;
    time_of_day?: number; // 0-23
    day_of_week?: number; // 0-6
    device_type?: 'mobile' | 'desktop' | 'tablet';
    app_version?: string;
  };
  timestamp: Date;
  created_at: Date;
}

const UserBehaviorSchema = new Schema<IUserBehavior>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  session_id: { type: String, required: true },
  activity_type: {
    type: String,
    enum: [
      'message_sent', 
      'message_received', 
      'call_made', 
      'call_received', 
      'online', 
      'offline', 
      'typing', 
      'voice_note', 
      'file_share'
    ],
    required: true
  },
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  metadata: {
    message_length: { type: Number },
    response_time: { type: Number },
    emotion_detected: { type: String },
    call_duration: { type: Number },
    file_type: { type: String },
    time_of_day: { type: Number, min: 0, max: 23 },
    day_of_week: { type: Number, min: 0, max: 6 },
    device_type: { 
      type: String, 
      enum: ['mobile', 'desktop', 'tablet'] 
    },
    app_version: { type: String }
  },
  timestamp: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now }
});

// Indexes
UserBehaviorSchema.index({ user: 1, timestamp: -1 });
UserBehaviorSchema.index({ activity_type: 1 });
UserBehaviorSchema.index({ session_id: 1 });
UserBehaviorSchema.index({ user: 1, activity_type: 1, timestamp: -1 });

// Pre-save middleware to auto-fill metadata
UserBehaviorSchema.pre('save', function(next) {
  const now = new Date();
  this.metadata.time_of_day = now.getHours();
  this.metadata.day_of_week = now.getDay();
  next();
});

// Static methods for analytics
UserBehaviorSchema.statics.getUserActivityPattern = function(userId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          activity_type: '$activity_type',
          hour: '$metadata.time_of_day'
        },
        count: { $sum: 1 },
        avg_response_time: { $avg: '$metadata.response_time' }
      }
    },
    {
      $sort: { '_id.hour': 1 }
    }
  ]);
};

UserBehaviorSchema.statics.getResponseTimeAnalytics = function(userId: string, days: number = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        activity_type: 'message_sent',
        'metadata.response_time': { $exists: true },
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        avg_response_time: { $avg: '$metadata.response_time' },
        min_response_time: { $min: '$metadata.response_time' },
        max_response_time: { $max: '$metadata.response_time' },
        total_messages: { $sum: 1 }
      }
    }
  ]);
};

UserBehaviorSchema.statics.getEmotionTrends = function(userId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        'metadata.emotion_detected': { $exists: true },
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          emotion: '$metadata.emotion_detected',
          date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.date': 1 }
    }
  ]);
};

UserBehaviorSchema.statics.createBehaviorEntry = async function(data: {
  userId: string;
  sessionId: string;
  activityType: string;
  conversationId?: string;
  metadata?: any;
}) {
  return this.create({
    user: data.userId,
    session_id: data.sessionId,
    activity_type: data.activityType,
    conversation: data.conversationId,
    metadata: data.metadata || {}
  });
};

const UserBehavior = models.UserBehavior || model("UserBehavior", UserBehaviorSchema);

export default UserBehavior;