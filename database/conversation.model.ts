// src/database/models/conversation.model.ts
import mongoose, { Schema, Document, models, model } from 'mongoose';

export interface IConversation extends Document {
  type: 'private' | 'group';
  participants: mongoose.Types.ObjectId[]; // Ref to User
  name?: string; // Tên group (nếu là group chat)
  avatar?: mongoose.Types.ObjectId; // Ref to File (avatar của group)
  description?: string;
  admin?: mongoose.Types.ObjectId; // Ref to User (admin của group)
  last_message?: mongoose.Types.ObjectId; // Ref to Message
  last_activity: Date;
  is_archived: boolean;
  created_by: mongoose.Types.ObjectId; // Ref to User
  created_at: Date;
  updated_at: Date;
}

const ConversationSchema = new Schema<IConversation>({
  type: { type: String, enum: ['private', 'group'], required: true },
  participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  name: { type: String }, // Required for group chats
  avatar: { type: Schema.Types.ObjectId, ref: 'File' },
  description: { type: String, maxlength: 500 },
  admin: { type: Schema.Types.ObjectId, ref: 'User' },
  last_message: { type: Schema.Types.ObjectId, ref: 'Message' },
  last_activity: { type: Date, default: Date.now },
  is_archived: { type: Boolean, default: false },
  created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Indexes
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ last_activity: -1 });
ConversationSchema.index({ type: 1 });
ConversationSchema.index({ created_by: 1 });

// Validation
ConversationSchema.pre('save', function(next) {
  this.updated_at = new Date();
  
  // Validate group chat requirements
  if (this.type === 'group') {
    if (!this.name) {
      return next(new Error('Group conversations must have a name'));
    }
    if (this.participants.length < 2) {
      return next(new Error('Group conversations must have at least 2 participants'));
    }
    if (!this.admin) {
      this.admin = this.created_by; // Set creator as admin if not specified
    }
  } else if (this.type === 'private') {
    if (this.participants.length !== 2) {
      return next(new Error('Private conversations must have exactly 2 participants'));
    }
  }
  
  next();
});

// Static methods
ConversationSchema.statics.getByParticipants = function(participants: string[]) {
  if (participants.length === 2) {
    // Private conversation
    return this.findOne({
      type: 'private',
      participants: { $all: participants, $size: 2 }
    });
  } else {
    // Group conversation - exact match
    return this.findOne({
      type: 'group',
      participants: { $all: participants, $size: participants.length }
    });
  }
};

ConversationSchema.statics.getUserConversations = function(userId: string) {
  return this.find({
    participants: userId,
    is_archived: false
  })
  .populate('participants', 'username full_name avatar is_online last_seen')
  .populate('last_message')
  .populate('avatar')
  .sort({ last_activity: -1 });
};

const Conversation = models.Conversation || model("Conversation", ConversationSchema);

export default Conversation;