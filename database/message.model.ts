/* eslint-disable @typescript-eslint/no-explicit-any */
// src/database/models/message.model.ts
import mongoose, { Schema, Document, models, model } from 'mongoose';

export interface IMessage extends Document {
  conversation: mongoose.Types.ObjectId; // Ref to Conversation
  sender: mongoose.Types.ObjectId; // Ref to User
  content?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'voice_note' | 'location' | 'call_log';
  attachments: mongoose.Types.ObjectId[]; // Ref to File
  reply_to?: mongoose.Types.ObjectId; // Ref to Message (trả lời tin nhắn)
  reactions: {
    user: mongoose.Types.ObjectId; // Ref to User
    emoji: string;
    created_at: Date;
  }[];
  is_edited: boolean;
  edited_at?: Date;
  is_deleted: boolean;
  deleted_at?: Date;
  read_by: {
    user: mongoose.Types.ObjectId; // Ref to User
    read_at: Date;
  }[];
  metadata?: any; // Metadata cho call logs, location, etc.
  created_at: Date;
  updated_at: Date;
}

const MessageSchema = new Schema<IMessage>({
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'file', 'voice_note', 'location', 'call_log'],
    default: 'text'
  },
  attachments: [{ type: Schema.Types.ObjectId, ref: 'File' }],
  reply_to: { type: Schema.Types.ObjectId, ref: 'Message' },
  reactions: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    emoji: { type: String },
    created_at: { type: Date, default: Date.now }
  }],
  is_edited: { type: Boolean, default: false },
  edited_at: { type: Date },
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date },
  read_by: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    read_at: { type: Date, default: Date.now }
  }],
  metadata: { type: Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Indexes
MessageSchema.index({ conversation: 1, created_at: -1 });
MessageSchema.index({ sender: 1 });
MessageSchema.index({ type: 1 });
MessageSchema.index({ conversation: 1, is_deleted: 1, created_at: -1 });

// Validation
MessageSchema.pre('save', function(next) {
  this.updated_at = new Date();
  
  // Validate message content based on type
  if (this.type === 'text' && !this.content && this.attachments.length === 0) {
    return next(new Error('Text messages must have content or attachments'));
  }
  
  if (this.type !== 'text' && this.attachments.length === 0 && !this.metadata) {
    return next(new Error('Non-text messages must have attachments or metadata'));
  }
  
  // Set edited timestamp
  if (this.isModified('content') && !this.isNew) {
    this.is_edited = true;
    this.edited_at = new Date();
  }
  
  // Set deleted timestamp
  if (this.isModified('is_deleted') && this.is_deleted) {
    this.deleted_at = new Date();
  }
  
  next();
});

// Instance methods
MessageSchema.methods.markAsRead = function(userId: string) {
  const existingRead = this.read_by.find((r:any) => r.user.toString() === userId);
  if (!existingRead) {
    this.read_by.push({
      user: new mongoose.Types.ObjectId(userId),
      read_at: new Date()
    });
    return this.save();
  }
  return Promise.resolve(this);
};

MessageSchema.methods.addReaction = function(userId: string, emoji: string) {
  // Remove existing reaction from this user first
  this.reactions = this.reactions.filter((r:any)=> r.user.toString() !== userId);
  
  // Add new reaction
  this.reactions.push({
    user: new mongoose.Types.ObjectId(userId),
    emoji,
    created_at: new Date()
  });
  
  return this.save();
};

MessageSchema.methods.removeReaction = function(userId: string) {
  this.reactions = this.reactions.filter((r:any)=> r.user.toString() !== userId);
  return this.save();
};

// Static methods
MessageSchema.statics.getConversationMessages = function(
  conversationId: string, 
  page: number = 1, 
  limit: number = 50
) {
  const skip = (page - 1) * limit;
  
  return this.find({
    conversation: conversationId,
    is_deleted: false
  })
  .populate('sender', 'username full_name avatar')
  .populate('attachments')
  .populate('reply_to')
  .populate('reactions.user', 'username full_name')
  .sort({ created_at: -1 })
  .skip(skip)
  .limit(limit);
};

const Message = models.Message || model("Message", MessageSchema);

export default Message;