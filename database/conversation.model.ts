// src/database/models/conversation.model.ts
import mongoose, { Document, model, models, Schema } from "mongoose";

export interface IConversation extends Document {
  type: "private" | "group";
  participants: mongoose.Types.ObjectId[]; // Ref to User
  name?: string; // Tên group (nếu là group chat)
  avatar?: mongoose.Types.ObjectId; // Ref to File (avatar của group)
  description?: string;
  admin?: mongoose.Types.ObjectId; // Ref to User (admin của group)
  last_message?: mongoose.Types.ObjectId; // Ref to Message
  last_activity: Date;
  is_archived: boolean;
  is_pinned: boolean; // Ghim cuộc trò chuyện
  is_muted: boolean; // Tắt thông báo
  is_blocked: boolean; // Chặn cuộc trò chuyện
  settings: {
    allow_member_invite: boolean; // Cho phép thành viên mời người khác
    allow_member_edit_info: boolean; // Cho phép thành viên chỉnh sửa thông tin
    allow_member_send_message: boolean; // Cho phép thành viên gửi tin nhắn
    allow_member_see_members: boolean; // Cho phép thành viên xem danh sách thành viên
  };
  created_by: mongoose.Types.ObjectId; // Ref to User
  created_at: Date;
  updated_at: Date;
}

const ConversationSchema = new Schema<IConversation>({
  type: { type: String, enum: ["private", "group"], required: true },
  participants: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
  name: { type: String }, // Required for group chats
  avatar: { type: Schema.Types.ObjectId, ref: "File" },
  description: { type: String, maxlength: 500 },
  admin: { type: Schema.Types.ObjectId, ref: "User" },
  last_message: { type: Schema.Types.ObjectId, ref: "Message" },
  last_activity: { type: Date, default: Date.now },
  is_archived: { type: Boolean, default: false },
  is_pinned: { type: Boolean, default: false },
  is_muted: { type: Boolean, default: false },
  is_blocked: { type: Boolean, default: false },
  settings: {
    allow_member_invite: { type: Boolean, default: true },
    allow_member_edit_info: { type: Boolean, default: false },
    allow_member_send_message: { type: Boolean, default: true },
    allow_member_see_members: { type: Boolean, default: true },
  },
  created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Indexes
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ last_activity: -1 });
ConversationSchema.index({ type: 1 });
ConversationSchema.index({ created_by: 1 });
ConversationSchema.index({ is_archived: 1, last_activity: -1 });
ConversationSchema.index({ is_pinned: 1, last_activity: -1 });
ConversationSchema.index({ is_muted: 1 });
ConversationSchema.index({ is_blocked: 1 });

// Validation
ConversationSchema.pre("save", function (next) {
  this.updated_at = new Date();

  // Validate group chat requirements
  if (this.type === "group") {
    if (!this.name) {
      return next(new Error("Group conversations must have a name"));
    }
    if (this.participants.length < 2) {
      return next(
        new Error("Group conversations must have at least 2 participants")
      );
    }
    if (!this.admin) {
      this.admin = this.created_by; // Set creator as admin if not specified
    }
  } else if (this.type === "private") {
    if (this.participants.length !== 2) {
      return next(
        new Error("Private conversations must have exactly 2 participants")
      );
    }
  }

  next();
});

// Static methods
ConversationSchema.statics.getByParticipants = function (
  participants: string[]
) {
  if (participants.length === 2) {
    // Private conversation
    return this.findOne({
      type: "private",
      participants: { $all: participants, $size: 2 },
    });
  } else {
    // Group conversation - exact match
    return this.findOne({
      type: "group",
      participants: { $all: participants, $size: participants.length },
    });
  }
};

ConversationSchema.statics.getUserConversations = function (userId: string) {
  return this.find({
    participants: userId,
    is_archived: false,
  })
    .populate("participants", "username full_name avatar is_online last_seen")
    .populate("last_message")
    .populate("avatar")
    .sort({ is_pinned: -1, last_activity: -1 });
};

// Instance methods
ConversationSchema.methods.addParticipant = function (userId: string) {
  if (!this.participants.includes(userId)) {
    this.participants.push(new mongoose.Types.ObjectId(userId));
    this.last_activity = new Date();
  }
  return this.save();
};

ConversationSchema.methods.removeParticipant = function (userId: string) {
  this.participants = this.participants.filter(
    (p: mongoose.Types.ObjectId) => p.toString() !== userId
  );
  this.last_activity = new Date();
  return this.save();
};

ConversationSchema.methods.updateLastMessage = function (messageId: string) {
  this.last_message = new mongoose.Types.ObjectId(messageId);
  this.last_activity = new Date();
  return this.save();
};

ConversationSchema.methods.pinConversation = function () {
  this.is_pinned = true;
  return this.save();
};

ConversationSchema.methods.unpinConversation = function () {
  this.is_pinned = false;
  return this.save();
};

ConversationSchema.methods.muteConversation = function () {
  this.is_muted = true;
  return this.save();
};

ConversationSchema.methods.unmuteConversation = function () {
  this.is_muted = false;
  return this.save();
};

ConversationSchema.methods.archiveConversation = function () {
  this.is_archived = true;
  return this.save();
};

ConversationSchema.methods.unarchiveConversation = function () {
  this.is_archived = false;
  return this.save();
};

ConversationSchema.methods.blockConversation = function () {
  this.is_blocked = true;
  return this.save();
};

ConversationSchema.methods.unblockConversation = function () {
  this.is_blocked = false;
  return this.save();
};

ConversationSchema.methods.updateSettings = function (
  settings: Partial<IConversation["settings"]>
) {
  this.settings = { ...this.settings, ...settings };
  return this.save();
};

ConversationSchema.methods.isParticipant = function (userId: string) {
  return this.participants.some(
    (p: mongoose.Types.ObjectId) => p.toString() === userId
  );
};

ConversationSchema.methods.isAdmin = function (userId: string) {
  return this.admin && this.admin.toString() === userId;
};

ConversationSchema.methods.isCreator = function (userId: string) {
  return this.created_by.toString() === userId;
};

const Conversation =
  models.Conversation || model("Conversation", ConversationSchema);

export default Conversation;
