/* eslint-disable @typescript-eslint/no-explicit-any */
// src/database/models/message.model.ts
import mongoose, { Document, model, models, Schema } from "mongoose";

export interface IMessage extends Document {
  conversation: mongoose.Types.ObjectId; // Ref to Conversation
  sender: mongoose.Types.ObjectId; // Ref to User
  content?: string;
  type:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "file"
    | "voice_note"
    | "location"
    | "call_log";
  attachments: mongoose.Types.ObjectId[]; // Ref to File
  reply_to?: mongoose.Types.ObjectId; // Ref to Message (trả lời tin nhắn)
  reactions: {
    user: mongoose.Types.ObjectId; // Ref to User
    type: "heart" | "like" | "sad" | "angry" | "laugh" | "wow";
    created_at: Date;
  }[];
  is_edited: boolean;
  edited_at?: Date;
  deleted_by: {
    user: mongoose.Types.ObjectId; // Ref to User
    deleted_at: Date;
    delete_type: "both" | "only_me"; // both: thu hồi (cả hai không thấy), only_me: xóa cho mình
  }[];
  read_by: {
    user: mongoose.Types.ObjectId; // Ref to User
    read_at: Date;
  }[];
  metadata?: any; // Metadata cho call logs, location, etc.
  created_at: Date;
  updated_at: Date;
}

const MessageSchema = new Schema<IMessage>({
  conversation: {
    type: Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
  },
  sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String },
  type: {
    type: String,
    enum: [
      "text",
      "image",
      "video",
      "audio",
      "file",
      "voice_note",
      "location",
      "call_log",
    ],
    default: "text",
  },
  attachments: [{ type: Schema.Types.ObjectId, ref: "File" }],
  reply_to: { type: Schema.Types.ObjectId, ref: "Message" },
  reactions: [
    {
      user: { type: Schema.Types.ObjectId, ref: "User" },
      type: {
        type: String,
        enum: ["heart", "like", "sad", "angry", "laugh", "wow", "dislike"],
        required: true,
      },
      created_at: { type: Date, default: Date.now },
    },
  ],
  is_edited: { type: Boolean, default: false },
  edited_at: { type: Date },
  deleted_by: [
    {
      user: { type: Schema.Types.ObjectId, ref: "User" },
      deleted_at: { type: Date, default: Date.now },
      delete_type: {
        type: String,
        enum: ["both", "only_me"],
        required: true,
      },
    },
  ],
  read_by: [
    {
      user: { type: Schema.Types.ObjectId, ref: "User" },
      read_at: { type: Date, default: Date.now },
    },
  ],
  metadata: { type: Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Indexes
MessageSchema.index({ conversation: 1, created_at: -1 });
MessageSchema.index({ sender: 1 });
MessageSchema.index({ type: 1 });
MessageSchema.index({ conversation: 1, "deleted_by.user": 1, created_at: -1 });
MessageSchema.index({ "deleted_by.delete_type": 1 });

// Validation
MessageSchema.pre("save", function (next) {
  this.updated_at = new Date();

  // Validate message content based on type
  if (this.type === "text" && !this.content && this.attachments.length === 0) {
    return next(new Error("Text messages must have content or attachments"));
  }

  if (this.type !== "text" && this.attachments.length === 0 && !this.metadata) {
    return next(
      new Error("Non-text messages must have attachments or metadata")
    );
  }

  // Set edited timestamp
  if (this.isModified("content") && !this.isNew) {
    this.is_edited = true;
    this.edited_at = new Date();
  }

  // Validation for deleted_by array
  if (this.isModified("deleted_by")) {
    // Ensure no duplicate users in deleted_by
    const userIds = this.deleted_by.map((d: any) => d.user.toString());
    const uniqueUserIds = [...new Set(userIds)];
    if (userIds.length !== uniqueUserIds.length) {
      return next(new Error("Duplicate users in deleted_by array"));
    }
  }

  next();
});

// Instance methods
MessageSchema.methods.markAsRead = function (userId: string) {
  const existingRead = this.read_by.find(
    (r: any) => r.user.toString() === userId
  );
  if (!existingRead) {
    this.read_by.push({
      user: new mongoose.Types.ObjectId(userId),
      read_at: new Date(),
    });
    return this.save();
  }
  return Promise.resolve(this);
};

MessageSchema.methods.addReaction = function (
  userId: string,
  reactionType: "heart" | "like" | "sad" | "angry" | "laugh" | "wow"
) {
  // Remove existing reaction from this user first
  this.reactions = this.reactions.filter(
    (r: any) => r.user.toString() !== userId
  );

  // Add new reaction
  this.reactions.push({
    user: new mongoose.Types.ObjectId(userId),
    type: reactionType,
    created_at: new Date(),
  });

  return this.save();
};

MessageSchema.methods.removeReaction = function (userId: string) {
  this.reactions = this.reactions.filter(
    (r: any) => r.user.toString() !== userId
  );
  return this.save();
};

MessageSchema.methods.deleteForUser = function (
  userId: string,
  deleteType: "both" | "only_me"
) {
  // Remove existing deletion record for this user
  this.deleted_by = this.deleted_by.filter(
    (d: any) => d.user.toString() !== userId
  );

  // Add new deletion record
  this.deleted_by.push({
    user: new mongoose.Types.ObjectId(userId),
    deleted_at: new Date(),
    delete_type: deleteType,
  });

  return this.save();
};

MessageSchema.methods.isDeletedForUser = function (userId: string) {
  return this.deleted_by.some((d: any) => d.user.toString() === userId);
};

MessageSchema.methods.getDeleteTypeForUser = function (userId: string) {
  const deletion = this.deleted_by.find(
    (d: any) => d.user.toString() === userId
  );
  return deletion ? deletion.delete_type : null;
};

MessageSchema.methods.getReactionByUser = function (userId: string) {
  return this.reactions.find((r: any) => r.user.toString() === userId);
};

MessageSchema.methods.getReactionCounts = function () {
  const counts: Record<string, number> = {};
  this.reactions.forEach((reaction: any) => {
    counts[reaction.type] = (counts[reaction.type] || 0) + 1;
  });
  return counts;
};

MessageSchema.methods.recallMessage = function (userId: string) {
  // Only sender can recall message
  if (this.sender.toString() !== userId) {
    throw new Error("Only sender can recall message");
  }

  // Add recall record (both = thu hồi)
  this.deleted_by = this.deleted_by.filter(
    (d: any) => d.user.toString() !== userId
  );

  this.deleted_by.push({
    user: new mongoose.Types.ObjectId(userId),
    deleted_at: new Date(),
    delete_type: "both",
  });

  return this.save();
};

// Static methods
MessageSchema.statics.getConversationMessages = function (
  conversationId: string,
  userId: string,
  page: number = 1,
  limit: number = 50
) {
  const skip = (page - 1) * limit;

  return this.find({
    conversation: conversationId,
    $or: [
      // Tin nhắn chưa bị xóa
      { "deleted_by.user": { $ne: new mongoose.Types.ObjectId(userId) } },
      // Hoặc tin nhắn bị xóa "only_me" (không phải "both")
      {
        deleted_by: {
          $elemMatch: {
            user: new mongoose.Types.ObjectId(userId),
            delete_type: { $ne: "both" },
          },
        },
      },
    ],
  })
    .populate("sender", "username full_name avatar")
    .populate("attachments")
    .populate("reply_to")
    .populate("reactions.user", "username full_name")
    .populate("deleted_by.user", "username full_name")
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit);
};

MessageSchema.statics.getDeletedMessagesForUser = function (userId: string) {
  return this.find({
    "deleted_by.user": new mongoose.Types.ObjectId(userId),
  })
    .populate("sender", "username full_name avatar")
    .populate("conversation", "name type")
    .sort({ "deleted_by.deleted_at": -1 });
};

MessageSchema.statics.getRecalledMessages = function (conversationId?: string) {
  const query: any = {
    "deleted_by.delete_type": "both",
  };
  if (conversationId) {
    query.conversation = new mongoose.Types.ObjectId(conversationId);
  }

  return this.find(query)
    .populate("sender", "username full_name avatar")
    .populate("conversation", "name type")
    .populate("deleted_by.user", "username full_name")
    .sort({ "deleted_by.deleted_at": -1 });
};

const Message = models.Message || model("Message", MessageSchema);

export default Message;
