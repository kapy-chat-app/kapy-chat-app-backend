/* eslint-disable @typescript-eslint/no-explicit-any */
// src/database/models/notification.model.ts
import mongoose, { Schema, Document, models, model } from 'mongoose';

export interface INotification extends Document {
  recipient: mongoose.Types.ObjectId; // Ref to User
  sender?: mongoose.Types.ObjectId; // Ref to User
  type: 'message' | 'friend_request' | 'call' | 'ai_suggestion' | 'mood_reminder' | 'system';
  title: string;
  content: string;
  data?: any; // Additional data for deep linking
  is_read: boolean;
  is_delivered: boolean;
  delivery_method: 'push' | 'in_app' | 'email';
  scheduled_for?: Date;
  expires_at?: Date;
  created_at: Date;
}

const NotificationSchema = new Schema<INotification>({
  recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sender: { type: Schema.Types.ObjectId, ref: 'User' },
  type: {
    type: String,
    enum: ['message', 'friend_request', 'call', 'ai_suggestion', 'mood_reminder', 'system'],
    required: true
  },
  title: { type: String, required: true },
  content: { type: String, required: true },
  data: { type: Schema.Types.Mixed },
  is_read: { type: Boolean, default: false },
  is_delivered: { type: Boolean, default: false },
  delivery_method: {
    type: String,
    enum: ['push', 'in_app', 'email'],
    default: 'in_app'
  },
  scheduled_for: { type: Date },
  expires_at: { type: Date },
  created_at: { type: Date, default: Date.now }
});

// Indexes
NotificationSchema.index({ recipient: 1, created_at: -1 });
NotificationSchema.index({ type: 1, is_read: 1 });
NotificationSchema.index({ scheduled_for: 1, is_delivered: 1 });
NotificationSchema.index({ expires_at: 1 });

// Pre-save middleware
NotificationSchema.pre('save', function(next) {
  // Set default expiration (30 days from creation)
  if (!this.expires_at && this.isNew) {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30);
    this.expires_at = expirationDate;
  }
  
  // If scheduled_for is not set, deliver immediately
  if (!this.scheduled_for && this.isNew) {
    this.scheduled_for = new Date();
  }
  
  next();
});

// Instance methods
NotificationSchema.methods.markAsRead = function() {
  this.is_read = true;
  return this.save();
};

NotificationSchema.methods.markAsDelivered = function() {
  this.is_delivered = true;
  return this.save();
};

// Static methods
NotificationSchema.statics.getUserNotifications = function(userId: string, page: number = 1, limit: number = 20) {
  const skip = (page - 1) * limit;
  
  return this.find({
    recipient: userId,
    $or: [
      { expires_at: { $gt: new Date() } },
      { expires_at: { $exists: false } }
    ]
  })
  .populate('sender', 'username full_name avatar')
  .sort({ created_at: -1 })
  .skip(skip)
  .limit(limit);
};

NotificationSchema.statics.getUnreadNotifications = function(userId: string) {
  return this.find({
    recipient: userId,
    is_read: false,
    $or: [
      { expires_at: { $gt: new Date() } },
      { expires_at: { $exists: false } }
    ]
  })
  .populate('sender', 'username full_name avatar')
  .sort({ created_at: -1 });
};

NotificationSchema.statics.getPendingNotifications = function() {
  return this.find({
    is_delivered: false,
    scheduled_for: { $lte: new Date() },
    $or: [
      { expires_at: { $gt: new Date() } },
      { expires_at: { $exists: false } }
    ]
  })
  .populate('recipient', 'clerkId notification_settings')
  .populate('sender', 'username full_name avatar');
};

NotificationSchema.statics.createNotification = async function(data: {
  recipientId: string;
  senderId?: string;
  type: string;
  title: string;
  content: string;
  data?: any;
  deliveryMethod?: string;
  scheduledFor?: Date;
  expiresAt?: Date;
}) {
  return this.create({
    recipient: data.recipientId,
    sender: data.senderId,
    type: data.type,
    title: data.title,
    content: data.content,
    data: data.data,
    delivery_method: data.deliveryMethod || 'in_app',
    scheduled_for: data.scheduledFor,
    expires_at: data.expiresAt
  });
};

NotificationSchema.statics.markAllAsRead = function(userId: string) {
  return this.updateMany(
    { recipient: userId, is_read: false },
    { $set: { is_read: true } }
  );
};

NotificationSchema.statics.cleanExpiredNotifications = function() {
  return this.deleteMany({
    expires_at: { $lt: new Date() }
  });
};

NotificationSchema.statics.getNotificationStats = function(userId: string) {
  return this.aggregate([
    {
      $match: {
        recipient: new mongoose.Types.ObjectId(userId),
        $or: [
          { expires_at: { $gt: new Date() } },
          { expires_at: { $exists: false } }
        ]
      }
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: 1 },
        unread: {
          $sum: { $cond: [{ $eq: ['$is_read', false] }, 1, 0] }
        }
      }
    }
  ]);
};

const Notification = models.Notification || model("Notification", NotificationSchema);

export default Notification;