// src/database/models/message.model.ts - UPDATED
/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose, { Document, Model, model, models, Schema } from "mongoose";

export interface IMessage extends Document {
  conversation: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  content?: string;
  encrypted_content?: string;
  encryption_metadata?: {
    type: "PreKeyWhisperMessage" | "WhisperMessage";
    registration_id?: number;
    pre_key_id?: number;
    signed_pre_key_id?: number;
  };
  type:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "file"
    | "voice_note"
    | "location"
    | "call_log"
    | "gif"
    | "sticker";
  attachments: mongoose.Types.ObjectId[];
  reply_to?: mongoose.Types.ObjectId;
  reactions: {
    user: mongoose.Types.ObjectId;
    type: "heart" | "like" | "sad" | "angry" | "laugh" | "wow" | "dislike";
    created_at: Date;
  }[];
  is_edited: boolean;
  edited_at?: Date;
  deleted_by: {
    user: mongoose.Types.ObjectId;
    deleted_at: Date;
    delete_type: "both" | "only_me";
  }[];
  read_by: {
    user: mongoose.Types.ObjectId;
    read_at: Date;
  }[];
  // ✨ UPDATED: Proper typing for metadata
  metadata?: {
    isSystemMessage?: boolean;
    action?:
      | "create_group"
      | "add_participants"
      | "remove_participant"
      | "leave_group"
      | "transfer_admin"
      | "auto_transfer_admin"
      | "update_group_name"
      | "update_group_description"
      | "update_group_avatar"
      | string;
    [key: string]: any;
  };
  rich_media?: {
    provider: "giphy" | "tenor" | "custom" | string;
    provider_id: string;
    url: string;
    media_url: string;
    preview_url?: string;
    width: number;
    height: number;
    size?: number;
    title?: string;
    rating?: string;
    tags?: string[];
    source_url?: string;
    extra_data?: Record<string, any>;
  };
  created_at: Date;
  updated_at: Date;

  // Instance methods
  markAsRead(userId: string): Promise<IMessage>;
  addReaction(
    userId: string,
    reactionType:
      | "heart"
      | "like"
      | "sad"
      | "angry"
      | "laugh"
      | "wow"
      | "dislike"
  ): Promise<IMessage>;
  removeReaction(userId: string): Promise<IMessage>;
  deleteForUser(
    userId: string,
    deleteType: "both" | "only_me"
  ): Promise<IMessage>;
  isDeletedForUser(userId: string): boolean;
  getDeleteTypeForUser(userId: string): "both" | "only_me" | null;
  getReactionByUser(userId: string): any;
  getReactionCounts(): Record<string, number>;
  recallMessage(userId: string): Promise<IMessage>;
  getMediaUrl(): string | null;
  getPreviewUrl(): string | null;
  getProviderInfo(): {
    provider: string;
    provider_id: string;
    url: string;
  } | null;
  // ✨ NEW: Check if message is system message
  isSystemMessage(): boolean;
}

// ✨ NEW: Interface for Message Model with static methods
export interface IMessageModel extends Model<IMessage> {
  getConversationMessages(
    conversationId: string,
    userId: string,
    page?: number,
    limit?: number
  ): Promise<IMessage[]>;

  getDeletedMessagesForUser(userId: string): Promise<IMessage[]>;

  getRecalledMessages(conversationId?: string): Promise<IMessage[]>;

  getPopularRichMedia(
    conversationId: string,
    type: "gif" | "sticker",
    provider?: string,
    limit?: number
  ): Promise<any[]>;

  getRichMediaStats(
    conversationId?: string,
    type?: "gif" | "sticker"
  ): Promise<any[]>;

  // ✨ NEW: Create system message helper
  createSystemMessage(
    conversationId: string,
    senderId: string,
    content: string,
    action: string,
    additionalMetadata?: Record<string, any>
  ): Promise<IMessage>;
}

const MessageSchema = new Schema<IMessage, IMessageModel>({
  conversation: {
    type: Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
  },
  sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String },
  encrypted_content: { type: String },
  encryption_metadata: {
    type: {
      type: String,
      enum: ["PreKeyWhisperMessage", "WhisperMessage"],
    },
    registration_id: { type: Number },
    pre_key_id: { type: Number },
    signed_pre_key_id: { type: Number },
  },
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
      "gif",
      "sticker",
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
  // ✨ UPDATED: Better structure for metadata
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
  rich_media: {
    provider: { type: String, required: false },
    provider_id: { type: String, required: false },
    url: { type: String, required: false },
    media_url: { type: String, required: false },
    preview_url: { type: String, required: false },
    width: { type: Number, required: false },
    height: { type: Number, required: false },
    size: { type: Number, required: false },
    title: { type: String, required: false },
    rating: { type: String, required: false },
    tags: [{ type: String }],
    source_url: { type: String, required: false },
    extra_data: { type: Schema.Types.Mixed },
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Indexes
MessageSchema.index({ conversation: 1, created_at: -1 });
MessageSchema.index({ sender: 1 });
MessageSchema.index({ type: 1 });
MessageSchema.index({ conversation: 1, "deleted_by.user": 1, created_at: -1 });
MessageSchema.index({ "deleted_by.delete_type": 1 });
MessageSchema.index({ "rich_media.provider": 1 });
MessageSchema.index({ "rich_media.provider_id": 1 });
MessageSchema.index({ conversation: 1, type: 1 });
// ✨ NEW: Index for system messages
MessageSchema.index({ "metadata.isSystemMessage": 1 });
MessageSchema.index({ "metadata.action": 1 });

// Pre-save middleware
MessageSchema.pre("save", function (next) {
  this.updated_at = new Date();

  if (this.type === "text") {
    // ✅ UPDATED: System messages don't need content validation
    if (!this.metadata?.isSystemMessage) {
      if (
        !this.encrypted_content &&
        !this.content &&
        this.attachments.length === 0
      ) {
        return next(
          new Error(
            "Text messages must have encrypted_content, content, or attachments"
          )
        );
      }
    }
  }

  if (this.type === "gif" || this.type === "sticker") {
    if (
      !this.rich_media ||
      !this.rich_media.provider ||
      !this.rich_media.media_url
    ) {
      return next(
        new Error(
          `${this.type} messages must have valid rich_media with provider and media_url`
        )
      );
    }
  }

  if (
    this.type !== "text" &&
    this.type !== "call_log" &&
    this.type !== "gif" &&
    this.type !== "sticker"
  ) {
    if (this.attachments.length === 0 && !this.metadata) {
      return next(
        new Error("Non-text messages must have attachments or metadata")
      );
    }
  }

  if (this.isModified("content") && !this.isNew) {
    this.is_edited = true;
    this.edited_at = new Date();
  }

  if (this.isModified("deleted_by")) {
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
  reactionType: "heart" | "like" | "sad" | "angry" | "laugh" | "wow" | "dislike"
) {
  this.reactions = this.reactions.filter(
    (r: any) => r.user.toString() !== userId
  );

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
  this.deleted_by = this.deleted_by.filter(
    (d: any) => d.user.toString() !== userId
  );

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
  if (this.sender.toString() !== userId) {
    throw new Error("Only sender can recall message");
  }

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

MessageSchema.methods.getMediaUrl = function () {
  if ((this.type === "gif" || this.type === "sticker") && this.rich_media) {
    return this.rich_media.media_url;
  }
  return null;
};

MessageSchema.methods.getPreviewUrl = function () {
  if ((this.type === "gif" || this.type === "sticker") && this.rich_media) {
    return this.rich_media.preview_url || this.rich_media.media_url;
  }
  return null;
};

MessageSchema.methods.getProviderInfo = function () {
  if ((this.type === "gif" || this.type === "sticker") && this.rich_media) {
    return {
      provider: this.rich_media.provider,
      provider_id: this.rich_media.provider_id,
      url: this.rich_media.url,
    };
  }
  return null;
};

// ✨ NEW: Check if message is system message
MessageSchema.methods.isSystemMessage = function () {
  return this.metadata?.isSystemMessage === true;
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
      { "deleted_by.user": { $ne: new mongoose.Types.ObjectId(userId) } },
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

MessageSchema.statics.getPopularRichMedia = function (
  conversationId: string,
  type: "gif" | "sticker",
  provider?: string,
  limit: number = 10
) {
  const matchQuery: any = {
    conversation: new mongoose.Types.ObjectId(conversationId),
    type: type,
    "rich_media.provider_id": { $exists: true },
  };

  if (provider) {
    matchQuery["rich_media.provider"] = provider;
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          provider: "$rich_media.provider",
          provider_id: "$rich_media.provider_id",
        },
        count: { $sum: 1 },
        lastUsed: { $max: "$created_at" },
        richMedia: { $first: "$rich_media" },
      },
    },
    { $sort: { count: -1, lastUsed: -1 } },
    { $limit: limit },
  ]);
};

MessageSchema.statics.getRichMediaStats = function (
  conversationId?: string,
  type?: "gif" | "sticker"
) {
  const matchQuery: any = {
    $or: [{ type: "gif" }, { type: "sticker" }],
    "rich_media.provider": { $exists: true },
  };

  if (conversationId) {
    matchQuery.conversation = new mongoose.Types.ObjectId(conversationId);
  }

  if (type) {
    matchQuery.type = type;
  }

  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          provider: "$rich_media.provider",
          type: "$type",
        },
        count: { $sum: 1 },
        lastUsed: { $max: "$created_at" },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

// ✨ NEW: Helper to create system messages
MessageSchema.statics.createSystemMessage = async function (
  conversationId: string,
  senderId: string,
  content: string,
  action: string,
  additionalMetadata?: Record<string, any>
) {
  const systemMessage = new this({
    conversation: conversationId,
    sender: senderId,
    content: content,
    type: "text",
    metadata: {
      isSystemMessage: true,
      action: action,
      ...additionalMetadata,
    },
  });

  return systemMessage.save();
};

const Message = (models.Message ||
  model<IMessage, IMessageModel>("Message", MessageSchema)) as IMessageModel;

export default Message;
