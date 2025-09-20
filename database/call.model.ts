/* eslint-disable @typescript-eslint/no-explicit-any */
// src/database/models/call.model.ts
import mongoose, { Schema, Document } from 'mongoose';
import { model } from 'mongoose';
import { models } from 'mongoose';

export interface ICall extends Document {
  conversation: mongoose.Types.ObjectId; // Ref to Conversation
  caller: mongoose.Types.ObjectId; // Ref to User
  participants: {
    user: mongoose.Types.ObjectId; // Ref to User
    joined_at?: Date;
    left_at?: Date;
    status: 'ringing' | 'joined' | 'declined' | 'missed' | 'left';
  }[];
  type: 'audio' | 'video';
  status: 'ringing' | 'ongoing' | 'ended' | 'declined' | 'missed';
  started_at: Date;
  ended_at?: Date;
  duration?: number; // seconds
  recording?: mongoose.Types.ObjectId; // Ref to File (nếu có ghi âm)
  quality_rating?: number; // 1-5 stars
  created_at: Date;
  updated_at: Date;
}

const CallSchema = new Schema<ICall>({
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  caller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    joined_at: { type: Date },
    left_at: { type: Date },
    status: {
      type: String,
      enum: ['ringing', 'joined', 'declined', 'missed', 'left'],
      default: 'ringing'
    }
  }],
  type: { type: String, enum: ['audio', 'video'], required: true },
  status: {
    type: String,
    enum: ['ringing', 'ongoing', 'ended', 'declined', 'missed'],
    default: 'ringing'
  },
  started_at: { type: Date, default: Date.now },
  ended_at: { type: Date },
  duration: { type: Number },
  recording: { type: Schema.Types.ObjectId, ref: 'File' },
  quality_rating: { type: Number, min: 1, max: 5 },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Indexes
CallSchema.index({ conversation: 1, created_at: -1 });
CallSchema.index({ caller: 1 });
CallSchema.index({ status: 1 });
CallSchema.index({ 'participants.user': 1 });

// Pre-save middleware
CallSchema.pre('save', function(next) {
  this.updated_at = new Date();
  
  // Calculate duration when call ends
  if (this.status === 'ended' && this.started_at && this.ended_at && !this.duration) {
    this.duration = Math.floor((this.ended_at.getTime() - this.started_at.getTime()) / 1000);
  }
  
  next();
});

// Instance methods
CallSchema.methods.addParticipant = function(userId: string) {
  const existingParticipant = this.participants.find((p:any) => p.user.toString() === userId);
  if (!existingParticipant) {
    this.participants.push({
      user: new mongoose.Types.ObjectId(userId),
      status: 'ringing'
    });
  }
  return this.save();
};

CallSchema.methods.updateParticipantStatus = function(userId: string, status: string) {
  const participant = this.participants.find((p:any) => p.user.toString() === userId);
  if (participant) {
    participant.status = status as any;
    
    if (status === 'joined') {
      participant.joined_at = new Date();
      // Update overall call status
      if (this.status === 'ringing') {
        this.status = 'ongoing';
      }
    } else if (status === 'left') {
      participant.left_at = new Date();
    }
  }
  return this.save();
};

CallSchema.methods.endCall = function() {
  this.status = 'ended';
  this.ended_at = new Date();
  
  // Update all participants who are still in the call
  this.participants.forEach((p:any)=> {
    if (p.status === 'joined' || p.status === 'ringing') {
      p.status = 'left';
      p.left_at = new Date();
    }
  });
  
  return this.save();
};

// Static methods
CallSchema.statics.getUserCallHistory = function(userId: string, page: number = 1, limit: number = 20) {
  const skip = (page - 1) * limit;
  
  return this.find({
    $or: [
      { caller: userId },
      { 'participants.user': userId }
    ]
  })
  .populate('caller', 'username full_name avatar')
  .populate('participants.user', 'username full_name avatar')
  .populate('conversation')
  .populate('recording')
  .sort({ created_at: -1 })
  .skip(skip)
  .limit(limit);
};

CallSchema.statics.getActiveCall = function(conversationId: string) {
  return this.findOne({
    conversation: conversationId,
    status: { $in: ['ringing', 'ongoing'] }
  })
  .populate('caller', 'username full_name avatar')
  .populate('participants.user', 'username full_name avatar');
};

const Call = models.Call || model("Call", CallSchema);

export default Call;