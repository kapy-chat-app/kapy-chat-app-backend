/* eslint-disable @typescript-eslint/no-explicit-any */
// src/database/models/call.model.ts
import mongoose, { Document, model, models, Schema } from "mongoose";

export interface ICallParticipant {
  user: mongoose.Types.ObjectId; // Ref to User
  joined_at?: Date;
  left_at?: Date;
  status: "ringing" | "joined" | "declined" | "missed" | "left"|"rejected";
  is_muted?: boolean;
  is_video_enabled?: boolean;
}

export interface ICall extends Document {
  conversation: mongoose.Types.ObjectId; // Ref to Conversation
  caller: mongoose.Types.ObjectId; // Ref to User
  participants: ICallParticipant[];
  type: "audio" | "video";
  is_group_call: boolean; // true = nhóm, false = cá nhân
  status: "ringing" | "ongoing" | "ended" | "declined" | "missed" | "cancelled"|"rejected";
  started_at: Date;
  ended_at?: Date;
  duration?: number;

 recording_audio_url?: string; // Cloudinary URL for audio
  recording_video_url?: string; // Cloudinary URL for video frame
  recording_duration?: number; // Duration in seconds
  recording_uploaded_at?: Date;
  emotion_analysis?: {
    emotion: string; // happy, sad, angry, neutral, etc.
    confidence: number; // 0-1
    analyzed_at: Date;
  };
  
  created_at: Date;
  updated_at: Date;
}

const CallSchema = new Schema<ICall>({
  conversation: {
    type: Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
  },
  caller: { type: Schema.Types.ObjectId, ref: "User", required: true },
  participants: [
    {
      user: { type: Schema.Types.ObjectId, ref: "User", required: true },
      joined_at: { type: Date },
      left_at: { type: Date },
      status: {
        type: String,
        enum: ["ringing", "joined", "declined", "missed", "left"],
        default: "ringing",
      },
      is_muted: { type: Boolean, default: false },
      is_video_enabled: { type: Boolean, default: true },
    },
  ],
  type: { type: String, enum: ["audio", "video"], required: true },
  is_group_call: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ["ringing", "ongoing", "ended", "declined", "missed", "cancelled","rejected"],
    default: "ringing",
  },
  started_at: { type: Date, default: Date.now },
  ended_at: { type: Date },
  duration: { type: Number },
   recording_audio_url: { type: String },
  recording_video_url: { type: String },
  recording_duration: { type: Number },
  recording_uploaded_at: { type: Date },
  emotion_analysis: {
    emotion: { type: String },
    confidence: { type: Number },
    analyzed_at: { type: Date },
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// Indexes - Tối ưu cho performance
CallSchema.index({ conversation: 1, created_at: -1 }); // Tìm cuộc gọi theo conversation
CallSchema.index({ caller: 1, created_at: -1 }); // Lịch sử cuộc gọi của caller
CallSchema.index({ status: 1, created_at: -1 }); // Tìm cuộc gọi theo trạng thái
CallSchema.index({ "participants.user": 1, created_at: -1 }); // Cuộc gọi của user
CallSchema.index({ is_group_call: 1, type: 1 }); // Phân loại cuộc gọi
CallSchema.index({ started_at: -1 }); // Sắp xếp theo thời gian bắt đầu
CallSchema.index({
  conversation: 1,
  status: 1,
}); // Tìm cuộc gọi đang hoạt động trong conversation
CallSchema.index({
  "participants.user": 1,
  status: 1,
}); // Tìm cuộc gọi đang hoạt động của user
CallSchema.index({ recording_audio_url: 1 }); // Tìm calls có recording
CallSchema.index({ "emotion_analysis.emotion": 1 }); // Tìm theo emotion
// Pre-save middleware - Validation và business logic
CallSchema.pre("save", function (next) {
  this.updated_at = new Date();

  // Tự động xác định is_group_call dựa trên số lượng participants
  this.is_group_call = this.participants.length > 2;

  // Calculate duration when call ends
  if (
    this.status === "ended" &&
    this.started_at &&
    this.ended_at &&
    !this.duration
  ) {
    this.duration = Math.floor(
      (this.ended_at.getTime() - this.started_at.getTime()) / 1000
    );
  }

  // Validation cho group calls
  if (this.is_group_call) {
    if (this.participants.length < 2) {
      return next(new Error("Group calls must have at least 2 participants"));
    }
    if (this.participants.length > 50) {
      return next(new Error("Group calls cannot exceed 50 participants"));
    }
  }

  // Validation cho personal calls
  if (!this.is_group_call && this.participants.length !== 2) {
    return next(new Error("Personal calls must have exactly 2 participants"));
  }

  next();
});

// Instance methods - Đơn giản như Zalo/Messenger
CallSchema.methods.addParticipant = function (userId: string) {
  const existingParticipant = this.participants.find(
    (p: any) => p.user.toString() === userId
  );
  if (!existingParticipant) {
    // Check max participants limit for group calls
    if (this.is_group_call && this.participants.length >= 50) {
      throw new Error("Maximum participants limit reached");
    }

    this.participants.push({
      user: new mongoose.Types.ObjectId(userId),
      status: "ringing",
      is_muted: false,
      is_video_enabled: this.type === "video",
    });
  }
  return this.save();
};

CallSchema.methods.updateParticipantStatus = function (
  userId: string,
  status: string,
  options: any = {}
) {
  const participant = this.participants.find(
    (p: any) => p.user.toString() === userId
  );
  if (participant) {
    participant.status = status as any;

    if (status === "joined") {
      participant.joined_at = new Date();
      // Update overall call status
      if (this.status === "ringing") {
        this.status = "ongoing";
      }
    } else if (status === "left") {
      participant.left_at = new Date();
    }

    // Update media settings if provided
    if (options.is_muted !== undefined) {
      participant.is_muted = options.is_muted;
    }
    if (options.is_video_enabled !== undefined) {
      participant.is_video_enabled = options.is_video_enabled;
    }
  }
  return this.save();
};

CallSchema.methods.endCall = function () {
  this.status = "ended";
  this.ended_at = new Date();

  // Update all participants who are still in the call
  this.participants.forEach((p: any) => {
    if (p.status === "joined" || p.status === "ringing") {
      p.status = "left";
      p.left_at = new Date();
    }
  });

  return this.save();
};

CallSchema.methods.getActiveParticipants = function () {
  return this.participants.filter((p: any) => p.status === "joined");
};

CallSchema.methods.getCaller = function () {
  return this.participants.find(
    (p: any) => p.user.toString() === this.caller.toString()
  );
};

// Static methods - Đơn giản như Zalo/Messenger
CallSchema.statics.getUserCallHistory = function (
  userId: string,
  options: any = {}
) {
  const {
    page = 1,
    limit = 20,
    is_group_call,
    type,
    status,
    date_from,
    date_to,
  } = options;
  const skip = (page - 1) * limit;

  const query: any = {
    $or: [{ caller: userId }, { "participants.user": userId }],
  };

  // Filters
  if (is_group_call !== undefined) query.is_group_call = is_group_call;
  if (type) query.type = type;
  if (status) query.status = status;
  if (date_from || date_to) {
    query.started_at = {};
    if (date_from) query.started_at.$gte = new Date(date_from);
    if (date_to) query.started_at.$lte = new Date(date_to);
  }

  return this.find(query)
    .populate("caller", "username full_name avatar")
    .populate("participants.user", "username full_name avatar")
    .populate("conversation", "name type participants")
    .sort({ started_at: -1 })
    .skip(skip)
    .limit(limit);
};

CallSchema.statics.getActiveCall = function (conversationId: string) {
  return this.findOne({
    conversation: conversationId,
    status: { $in: ["ringing", "ongoing"] },
  })
    .populate("caller", "username full_name avatar")
    .populate("participants.user", "username full_name avatar")
    .populate("conversation", "name type participants");
};

CallSchema.statics.getUserActiveCalls = function (userId: string) {
  return this.find({
    "participants.user": userId,
    status: { $in: ["ringing", "ongoing"] },
  })
    .populate("caller", "username full_name avatar")
    .populate("participants.user", "username full_name avatar")
    .populate("conversation", "name type participants");
};

CallSchema.statics.createPersonalCall = function (
  callerId: string,
  recipientId: string,
  type: "audio" | "video",
  conversationId: string
) {
  const call = new this({
    conversation: conversationId,
    caller: callerId,
    type,
    is_group_call: false,
    participants: [
      {
        user: callerId,
        status: "joined",
        is_muted: false,
        is_video_enabled: type === "video",
      },
      {
        user: recipientId,
        status: "ringing",
        is_muted: false,
        is_video_enabled: type === "video",
      },
    ],
  });

  return call.save();
};

CallSchema.statics.createGroupCall = function (
  callerId: string,
  participantIds: string[],
  type: "audio" | "video",
  conversationId: string
) {
  if (participantIds.length < 1) {
    throw new Error("Group calls must have at least 1 participant");
  }

  const participants = [
    {
      user: callerId,
      status: "joined",
      is_muted: false,
      is_video_enabled: type === "video",
    },
    ...participantIds.map((id) => ({
      user: id,
      status: "ringing",
      is_muted: false,
      is_video_enabled: type === "video",
    })),
  ];

  const call = new this({
    conversation: conversationId,
    caller: callerId,
    type,
    is_group_call: true,
    participants,
  });

  return call.save();
};

CallSchema.statics.getCallStatistics = function (
  userId: string,
  period: "day" | "week" | "month" | "year" = "month"
) {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "day":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
  }

  return this.aggregate([
    {
      $match: {
        $or: [
          { caller: new mongoose.Types.ObjectId(userId) },
          { "participants.user": new mongoose.Types.ObjectId(userId) },
        ],
        started_at: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: null,
        total_calls: { $sum: 1 },
        total_duration: { $sum: "$duration" },
        personal_calls: {
          $sum: { $cond: [{ $eq: ["$is_group_call", false] }, 1, 0] },
        },
        group_calls: {
          $sum: { $cond: [{ $eq: ["$is_group_call", true] }, 1, 0] },
        },
        audio_calls: {
          $sum: { $cond: [{ $eq: ["$type", "audio"] }, 1, 0] },
        },
        video_calls: {
          $sum: { $cond: [{ $eq: ["$type", "video"] }, 1, 0] },
        },
      },
    },
  ]);
};


CallSchema.statics.getCallsWithEmotion = function (
  userId: string,
  emotion?: string,
  options: any = {}
) {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const query: any = {
    $or: [{ caller: userId }, { "participants.user": userId }],
    recording_audio_url: { $exists: true },
  };

  if (emotion) {
    query["emotion_analysis.emotion"] = emotion;
  }

  return this.find(query)
    .populate("caller", "username full_name avatar")
    .populate("participants.user", "username full_name avatar")
    .populate("conversation", "name type participants")
    .sort({ started_at: -1 })
    .skip(skip)
    .limit(limit);
};

const Call = models.Call || model("Call", CallSchema);

export default Call;
