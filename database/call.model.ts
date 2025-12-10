/* eslint-disable @typescript-eslint/no-explicit-any */
// src/database/models/call.model.ts - UPDATED WITH REALTIME EMOTION TRACKING
import mongoose, { Document, model, models, Schema } from "mongoose";

export interface ICallParticipant {
  user: mongoose.Types.ObjectId;
  joined_at?: Date;
  left_at?: Date;
  status: "ringing" | "joined" | "declined" | "missed" | "left" | "rejected";
  is_muted?: boolean;
  is_video_enabled?: boolean;
}

// ⭐ NEW: Interface for realtime emotion data
export interface IRealtimeEmotion {
  user: mongoose.Types.ObjectId;
  emotion: string; // joy, sadness, anger, fear, surprise, neutral
  confidence: number; // 0-1
  emotion_scores: {
    joy: number;
    sadness: number;
    anger: number;
    fear: number;
    surprise: number;
    neutral: number;
  };
  timestamp: Date;
  audio_features?: {
    tone: string;
    pitch: number;
    speed: number;
    volume: number;
  };
}

// ⭐ NEW: Interface for emotion summary per participant
export interface IParticipantEmotionSummary {
  user: mongoose.Types.ObjectId;
  dominant_emotion: string;
  avg_confidence: number;
  emotion_distribution: {
    joy: number;
    sadness: number;
    anger: number;
    fear: number;
    surprise: number;
    neutral: number;
  };
  total_analyses: number;
}

export interface ICall extends Document {
  conversation: mongoose.Types.ObjectId;
  caller: mongoose.Types.ObjectId;
  participants: ICallParticipant[];
  type: "audio" | "video";
  is_group_call: boolean;
  status: "ringing" | "ongoing" | "ended" | "declined" | "missed" | "cancelled" | "rejected";
  started_at: Date;
  ended_at?: Date;
  duration?: number;

  // ⭐ DEPRECATED: Recording URLs (kept for backward compatibility)
  recording_audio_url?: string;
  recording_video_url?: string;
  recording_duration?: number;
  recording_uploaded_at?: Date;

  // ⭐ DEPRECATED: Single emotion analysis (replaced by realtime tracking)
  emotion_analysis?: {
    emotion: string;
    confidence: number;
    analyzed_at: Date;
  };

  // ⭐ NEW: Realtime emotion tracking
  realtime_emotions: IRealtimeEmotion[];
  
  // ⭐ NEW: Emotion summary (calculated when call ends)
  emotion_summary?: {
    most_common_emotion: string; // Overall most common emotion
    average_confidence: number; // Average confidence across all analyses
    total_analyses: number; // Total number of emotion samples captured
    emotion_distribution: { // Overall distribution
      joy: number;
      sadness: number;
      anger: number;
      fear: number;
      surprise: number;
      neutral: number;
    };
    participants_emotions: IParticipantEmotionSummary[]; // Per-participant summaries
    timeline?: Array<{ // Emotion changes over time
      timestamp: Date;
      emotion: string;
      user: mongoose.Types.ObjectId;
    }>;
  };

  created_at: Date;
  updated_at: Date;

  // ⭐ NEW: Instance methods
  addRealtimeEmotion(emotionData: Partial<IRealtimeEmotion>): Promise<this>;
  calculateEmotionSummary(): Promise<this>;
  getParticipantEmotions(userId: string): IRealtimeEmotion[];
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
        enum: ["ringing", "joined", "declined", "missed", "left", "rejected"],
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
    enum: ["ringing", "ongoing", "ended", "declined", "missed", "cancelled", "rejected"],
    default: "ringing",
  },
  started_at: { type: Date, default: Date.now },
  ended_at: { type: Date },
  duration: { type: Number },

  // DEPRECATED fields (kept for backward compatibility)
  recording_audio_url: { type: String },
  recording_video_url: { type: String },
  recording_duration: { type: Number },
  recording_uploaded_at: { type: Date },
  emotion_analysis: {
    emotion: { type: String },
    confidence: { type: Number },
    analyzed_at: { type: Date },
  },

  // ⭐ NEW: Realtime emotion tracking
  realtime_emotions: [
    {
      user: { type: Schema.Types.ObjectId, ref: "User", required: true },
      emotion: { type: String, required: true },
      confidence: { type: Number, required: true, min: 0, max: 1 },
      emotion_scores: {
        joy: { type: Number, default: 0, min: 0, max: 1 },
        sadness: { type: Number, default: 0, min: 0, max: 1 },
        anger: { type: Number, default: 0, min: 0, max: 1 },
        fear: { type: Number, default: 0, min: 0, max: 1 },
        surprise: { type: Number, default: 0, min: 0, max: 1 },
        neutral: { type: Number, default: 0, min: 0, max: 1 },
      },
      timestamp: { type: Date, default: Date.now },
      audio_features: {
        tone: { type: String },
        pitch: { type: Number },
        speed: { type: Number },
        volume: { type: Number },
      },
    },
  ],

  // ⭐ NEW: Emotion summary
  emotion_summary: {
    most_common_emotion: { type: String },
    average_confidence: { type: Number },
    total_analyses: { type: Number, default: 0 },
    emotion_distribution: {
      joy: { type: Number, default: 0 },
      sadness: { type: Number, default: 0 },
      anger: { type: Number, default: 0 },
      fear: { type: Number, default: 0 },
      surprise: { type: Number, default: 0 },
      neutral: { type: Number, default: 0 },
    },
    participants_emotions: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User" },
        dominant_emotion: { type: String },
        avg_confidence: { type: Number },
        emotion_distribution: {
          joy: { type: Number, default: 0 },
          sadness: { type: Number, default: 0 },
          anger: { type: Number, default: 0 },
          fear: { type: Number, default: 0 },
          surprise: { type: Number, default: 0 },
          neutral: { type: Number, default: 0 },
        },
        total_analyses: { type: Number, default: 0 },
      },
    ],
    timeline: [
      {
        timestamp: { type: Date },
        emotion: { type: String },
        user: { type: Schema.Types.ObjectId, ref: "User" },
      },
    ],
  },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

// ============================================
// INDEXES - Optimized for realtime queries
// ============================================
CallSchema.index({ conversation: 1, created_at: -1 });
CallSchema.index({ caller: 1, created_at: -1 });
CallSchema.index({ status: 1, created_at: -1 });
CallSchema.index({ "participants.user": 1, created_at: -1 });
CallSchema.index({ is_group_call: 1, type: 1 });
CallSchema.index({ started_at: -1 });
CallSchema.index({ conversation: 1, status: 1 });
CallSchema.index({ "participants.user": 1, status: 1 });

// ⭐ NEW: Indexes for emotion queries
CallSchema.index({ "realtime_emotions.user": 1 });
CallSchema.index({ "realtime_emotions.emotion": 1 });
CallSchema.index({ "realtime_emotions.timestamp": -1 });
CallSchema.index({ "emotion_summary.most_common_emotion": 1 });
CallSchema.index({ "emotion_summary.participants_emotions.user": 1 });

// ============================================
// PRE-SAVE MIDDLEWARE
// ============================================
CallSchema.pre("save", function (next) {
  this.updated_at = new Date();
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

  // Validation
  if (this.is_group_call) {
    if (this.participants.length < 2) {
      return next(new Error("Group calls must have at least 2 participants"));
    }
    if (this.participants.length > 50) {
      return next(new Error("Group calls cannot exceed 50 participants"));
    }
  }

  if (!this.is_group_call && this.participants.length !== 2) {
    return next(new Error("Personal calls must have exactly 2 participants"));
  }

  next();
});

// ============================================
// ⭐ NEW INSTANCE METHODS - Realtime Emotion
// ============================================

/**
 * Add a realtime emotion sample
 */
CallSchema.methods.addRealtimeEmotion = async function (
  emotionData: Partial<IRealtimeEmotion>
) {
  if (!emotionData.user || !emotionData.emotion || emotionData.confidence === undefined) {
    throw new Error("Missing required emotion data");
  }

  this.realtime_emotions.push({
    user: emotionData.user,
    emotion: emotionData.emotion,
    confidence: emotionData.confidence,
    emotion_scores: emotionData.emotion_scores || {
      joy: 0,
      sadness: 0,
      anger: 0,
      fear: 0,
      surprise: 0,
      neutral: 0,
    },
    timestamp: emotionData.timestamp || new Date(),
    audio_features: emotionData.audio_features,
  });

  console.log(
    `🎭 Added emotion: ${emotionData.emotion} (${(emotionData.confidence * 100).toFixed(0)}%) for user ${emotionData.user}`
  );

  return this.save();
};

/**
 * Calculate emotion summary (call when ending)
 */
CallSchema.methods.calculateEmotionSummary = async function () {
  if (this.realtime_emotions.length === 0) {
    console.log("⚠️ No emotion data to summarize");
    return this;
  }

  console.log(`📊 Calculating emotion summary for ${this.realtime_emotions.length} samples...`);

  // Count all emotions
  const emotionCounts: Record<string, number> = {};
  let totalConfidence = 0;
  const emotionDistribution = {
    joy: 0,
    sadness: 0,
    anger: 0,
    fear: 0,
    surprise: 0,
    neutral: 0,
  };

  // Type definition for participantData
  type EmotionDistribution = typeof emotionDistribution;
  
  // ✅ FIX: Đây là dòng bị lỗi - thiếu dấu 
  const participantData: Record<
    string,
    {
      emotions: string[];
      confidences: number[];
      scores: EmotionDistribution[];
    }
  > = {};

  const timeline: Array<{ timestamp: Date; emotion: string; user: mongoose.Types.ObjectId }> = [];

  // Process all emotion samples
  this.realtime_emotions.forEach((emotion: IRealtimeEmotion) => {
    const userId = emotion.user.toString();

    // Overall counts
    emotionCounts[emotion.emotion] = (emotionCounts[emotion.emotion] || 0) + 1;
    totalConfidence += emotion.confidence;

    // Distribution
    Object.keys(emotionDistribution).forEach((key) => {
      emotionDistribution[key as keyof typeof emotionDistribution] +=
        emotion.emotion_scores[key as keyof typeof emotionDistribution] || 0;
    });

    // Per-participant
    if (!participantData[userId]) {
      participantData[userId] = { emotions: [], confidences: [], scores: [] };
    }
    participantData[userId].emotions.push(emotion.emotion);
    participantData[userId].confidences.push(emotion.confidence);
    participantData[userId].scores.push(emotion.emotion_scores);

    // Timeline
    timeline.push({
      timestamp: emotion.timestamp,
      emotion: emotion.emotion,
      user: emotion.user,
    });
  });

  // Calculate most common emotion
  const mostCommonEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";

  const totalAnalyses = this.realtime_emotions.length;
  const avgConfidence = totalConfidence / totalAnalyses;

  // Normalize distribution
  Object.keys(emotionDistribution).forEach((key) => {
    emotionDistribution[key as keyof typeof emotionDistribution] /= totalAnalyses;
  });

  // Calculate per-participant summaries
  const participantsSummaries: IParticipantEmotionSummary[] = Object.entries(participantData).map(
    ([userId, data]) => {
      const counts: Record<string, number> = {};
      data.emotions.forEach((e) => {
        counts[e] = (counts[e] || 0) + 1;
      });

      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";
      const avgConf = data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length;

      // Calculate distribution for this participant
      const dist: EmotionDistribution = {
        joy: 0,
        sadness: 0,
        anger: 0,
        fear: 0,
        surprise: 0,
        neutral: 0,
      };

      data.scores.forEach((score) => {
        Object.keys(dist).forEach((key) => {
          dist[key as keyof EmotionDistribution] += score[key as keyof EmotionDistribution] || 0;
        });
      });

      // Normalize
      Object.keys(dist).forEach((key) => {
        dist[key as keyof EmotionDistribution] /= data.scores.length;
      });

      return {
        user: new mongoose.Types.ObjectId(userId),
        dominant_emotion: dominant,
        avg_confidence: avgConf,
        emotion_distribution: dist,
        total_analyses: data.emotions.length,
      };
    }
  );

  // Sort timeline
  timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Update emotion_summary
  this.emotion_summary = {
    most_common_emotion: mostCommonEmotion,
    average_confidence: avgConfidence,
    total_analyses: totalAnalyses,
    emotion_distribution: emotionDistribution,
    participants_emotions: participantsSummaries,
    timeline,
  };

  console.log(`✅ Emotion summary calculated: ${mostCommonEmotion} (${(avgConfidence * 100).toFixed(0)}%)`);

  return this.save();
};

/**
 * Get all emotions for a specific participant
 */
CallSchema.methods.getParticipantEmotions = function (userId: string): IRealtimeEmotion[] {
  return this.realtime_emotions.filter(
    (emotion: IRealtimeEmotion) => emotion.user.toString() === userId
  );
};

// ============================================
// EXISTING INSTANCE METHODS (unchanged)
// ============================================
CallSchema.methods.addParticipant = function (userId: string) {
  const existingParticipant = this.participants.find(
    (p: any) => p.user.toString() === userId
  );
  if (!existingParticipant) {
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
      if (this.status === "ringing") {
        this.status = "ongoing";
      }
    } else if (status === "left") {
      participant.left_at = new Date();
    }

    if (options.is_muted !== undefined) {
      participant.is_muted = options.is_muted;
    }
    if (options.is_video_enabled !== undefined) {
      participant.is_video_enabled = options.is_video_enabled;
    }
  }
  return this.save();
};

CallSchema.methods.endCall = async function () {
  this.status = "ended";
  this.ended_at = new Date();

  this.participants.forEach((p: any) => {
    if (p.status === "joined" || p.status === "ringing") {
      p.status = "left";
      p.left_at = new Date();
    }
  });

  // ⭐ NEW: Calculate emotion summary when ending call
  if (this.realtime_emotions.length > 0) {
    await this.calculateEmotionSummary();
  }

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

// ============================================
// EXISTING STATIC METHODS (unchanged)
// ============================================
CallSchema.statics.getUserCallHistory = function (userId: string, options: any = {}) {
  const { page = 1, limit = 20, is_group_call, type, status, date_from, date_to } = options;
  const skip = (page - 1) * limit;

  const query: any = {
    $or: [{ caller: userId }, { "participants.user": userId }],
  };

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

// ⭐ UPDATED: Get calls with emotion (now uses emotion_summary)
CallSchema.statics.getCallsWithEmotion = function (
  userId: string,
  emotion?: string,
  options: any = {}
) {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const query: any = {
    $or: [{ caller: userId }, { "participants.user": userId }],
    "emotion_summary.total_analyses": { $gt: 0 }, // Has emotion data
  };

  if (emotion) {
    query["emotion_summary.most_common_emotion"] = emotion;
  }

  return this.find(query)
    .populate("caller", "username full_name avatar")
    .populate("participants.user", "username full_name avatar")
    .populate("conversation", "name type participants")
    .sort({ started_at: -1 })
    .skip(skip)
    .limit(limit);
};

// ⭐ NEW: Get emotion timeline for a call
CallSchema.statics.getCallEmotionTimeline = function (callId: string) {
  return this.findById(callId)
    .select("emotion_summary.timeline realtime_emotions")
    .populate("realtime_emotions.user", "username full_name avatar")
    .populate("emotion_summary.timeline.user", "username full_name avatar");
};

const Call = models.Call || model("Call", CallSchema);

export default Call;