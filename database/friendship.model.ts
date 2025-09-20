// src/database/models/friendship.model.ts
import mongoose, { Schema, Document, models, model } from 'mongoose';

export interface IFriendship extends Document {
  requester: mongoose.Types.ObjectId; // Ref to User
  recipient: mongoose.Types.ObjectId; // Ref to User
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  created_at: Date;
  updated_at: Date;
  accepted_at?: Date;
}

const FriendshipSchema = new Schema<IFriendship>({
  requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'blocked'],
    default: 'pending'
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  accepted_at: { type: Date }
});

// Compound index để tránh duplicate friendships
FriendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });
FriendshipSchema.index({ status: 1 });
FriendshipSchema.index({ requester: 1, status: 1 });
FriendshipSchema.index({ recipient: 1, status: 1 });

// Pre-save middleware
FriendshipSchema.pre('save', function(next) {
  this.updated_at = new Date();
  if (this.status === 'accepted' && !this.accepted_at) {
    this.accepted_at = new Date();
  }
  next();
});

// Static methods
FriendshipSchema.statics.getFriends = function(userId: string) {
  return this.find({
    $or: [
      { requester: userId, status: 'accepted' },
      { recipient: userId, status: 'accepted' }
    ]
  }).populate('requester recipient', 'username full_name avatar is_online last_seen');
};

FriendshipSchema.statics.getPendingRequests = function(userId: string) {
  return this.find({
    recipient: userId,
    status: 'pending'
  }).populate('requester', 'username full_name avatar');
};

const Friendship = models.Friendship || model("Friendship", FriendshipSchema);

export default Friendship;