/* eslint-disable @typescript-eslint/no-explicit-any */
// src/actions/emotion.actions.ts - CLIENT-SIDE AI VERSION
"use server";

import { auth } from "@clerk/nextjs/server";
import mongoose from "mongoose";
import EmotionAnalysis from "@/database/emotion-analysis.model";
import { connectToDatabase } from "../mongoose";
import User from "@/database/user.model";
import { emitSocketEvent } from "../socket.helper";
import {
  GetEmotionHistoryParams,
  EmotionAnalysisDTO,
  GetEmotionStatsParams,
  EmotionStatsDTO,
} from "@/dtos/emotion-analysis.dto";
import { checkAndSendEmotionAlert } from "./ai-chat.action";
// ============================================
// SAVE EMOTION ANALYSIS FROM CLIENT
// ============================================
export interface SaveEmotionFromClientDTO {
  messageId?: string;
  conversationId?: string;
  textAnalyzed: string;
  emotionScores: {
    joy: number;
    sadness: number;
    anger: number;
    fear: number;
    surprise: number;
    neutral: number;
  };
  dominantEmotion: string;
  confidenceScore: number;
  context: 'message' | 'voice_note' | 'call' | 'general';
  isToxic?: boolean;
  toxicityScore?: number;
}

export async function saveEmotionAnalysis(data: SaveEmotionFromClientDTO) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const {
      messageId,
      conversationId,
      textAnalyzed,
      emotionScores,
      dominantEmotion,
      confidenceScore,
      context,
      isToxic,
      toxicityScore,
    } = data;

    console.log(`💾 Saving emotion from client: ${dominantEmotion} (${(confidenceScore * 100).toFixed(0)}%)`);

    // Validate emotion scores
    const totalScore = Object.values(emotionScores).reduce((sum, score) => sum + score, 0);
    if (Math.abs(totalScore - 1) > 0.15) {
      throw new Error('Emotion scores must sum to approximately 1');
    }

    // Create emotion analysis record
    const emotionAnalysis = await EmotionAnalysis.create({
      user: user._id,
      message: messageId ? new mongoose.Types.ObjectId(messageId) : undefined,
      conversation: conversationId ? new mongoose.Types.ObjectId(conversationId) : undefined,
      emotion_scores: emotionScores,
      dominant_emotion: dominantEmotion,
      confidence_score: confidenceScore,
      text_analyzed: textAnalyzed,
      context,
      metadata: {
        is_toxic: isToxic,
        toxicity_score: toxicityScore,
        analyzed_on: 'client',
        analyzed_at: new Date(),
      }
    });

    console.log(`✅ Emotion saved: ${emotionAnalysis._id}`);
 await checkAndSendEmotionAlert({
      userId: user.clerkId,
      dominantEmotion: emotionAnalysis.dominant_emotion,
      confidenceScore: emotionAnalysis.confidence_score,
      language: 'vi' 
    });

    // Emit socket event to other participants in conversation
    if (conversationId) {
      await emitSocketEvent(
        "emotionAnalysisComplete",
        conversationId,
        {
          user_id: user._id.toString(),
          message_id: messageId,
          emotion_data: {
            dominant_emotion: emotionAnalysis.dominant_emotion,
            confidence_score: emotionAnalysis.confidence_score,
            emotion_scores: emotionAnalysis.emotion_scores,
            is_toxic: isToxic,
          },
        },
        false
      );
    }

    return {
      success: true,
      data: {
        _id: emotionAnalysis._id.toString(),
        dominant_emotion: emotionAnalysis.dominant_emotion,
        confidence_score: emotionAnalysis.confidence_score,
        emotion_scores: emotionAnalysis.emotion_scores,
        analyzed_at: emotionAnalysis.analyzed_at,
      },
    };
  } catch (error) {
    console.error("❌ Error saving emotion analysis:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save emotion analysis",
    };
  }
}

// ============================================
// BATCH SAVE EMOTIONS (cho nhiều participants)
// ============================================
export interface BatchSaveEmotionDTO {
  participantIds: string[]; // Array of clerkIds
  messageId?: string;
  conversationId: string;
  textAnalyzed: string;
  emotionScores: {
    joy: number;
    sadness: number;
    anger: number;
    fear: number;
    surprise: number;
    neutral: number;
  };
  dominantEmotion: string;
  confidenceScore: number;
  context: 'message' | 'voice_note' | 'call' | 'general';
}

export async function batchSaveEmotionAnalysis(data: BatchSaveEmotionDTO) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const {
      participantIds,
      messageId,
      conversationId,
      textAnalyzed,
      emotionScores,
      dominantEmotion,
      confidenceScore,
      context,
    } = data;

    console.log(`💾 Batch saving emotion for ${participantIds.length} participants`);

    // Get all participant users
    const users = await User.find({ clerkId: { $in: participantIds } });
    
    if (users.length === 0) {
      throw new Error("No valid participants found");
    }

    // Create emotion analysis for each participant
    const emotionAnalyses = await Promise.all(
      users.map(async (user) => {
        const isSender = user.clerkId === userId;

        const emotionAnalysis = await EmotionAnalysis.create({
          user: user._id,
          message: messageId ? new mongoose.Types.ObjectId(messageId) : undefined,
          conversation: new mongoose.Types.ObjectId(conversationId),
          emotion_scores: emotionScores,
          dominant_emotion: dominantEmotion,
          confidence_score: confidenceScore,
          text_analyzed: textAnalyzed,
          context,
          metadata: {
            is_sender: isSender,
            analyzed_on: 'client',
            analyzed_at: new Date(),
          }
        });

        // Emit to this specific user
        await emitSocketEvent(
          "emotionAnalysisComplete",
          conversationId,
          {
            user_id: user._id.toString(),
            message_id: messageId,
            is_sender: isSender,
            emotion_data: {
              dominant_emotion: emotionAnalysis.dominant_emotion,
              confidence_score: emotionAnalysis.confidence_score,
              emotion_scores: emotionAnalysis.emotion_scores,
            },
          },
          false
        );

        return emotionAnalysis;
      })
    );

    console.log(`✅ Saved ${emotionAnalyses.length} emotion analyses`);

    return {
      success: true,
      data: {
        count: emotionAnalyses.length,
        analyses: emotionAnalyses.map((ea) => ({
          _id: ea._id.toString(),
          user: ea.user.toString(),
          dominant_emotion: ea.dominant_emotion,
          confidence_score: ea.confidence_score,
        })),
      },
    };
  } catch (error) {
    console.error("❌ Error batch saving emotions:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to batch save emotions",
    };
  }
}

// ============================================
// GET EMOTION TRENDS
// ============================================
export async function getEmotionTrends(data: { userId: string; days?: number }) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const { days = 30 } = data;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const trends = await EmotionAnalysis.aggregate([
      {
        $match: {
          user: user._id,
          analyzed_at: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            emotion: "$dominant_emotion",
            date: { $dateToString: { format: "%Y-%m-%d", date: "$analyzed_at" } },
          },
          count: { $sum: 1 },
          avg_confidence: { $avg: "$confidence_score" },
          avg_joy: { $avg: "$emotion_scores.joy" },
          avg_sadness: { $avg: "$emotion_scores.sadness" },
          avg_anger: { $avg: "$emotion_scores.anger" },
          avg_fear: { $avg: "$emotion_scores.fear" },
        },
      },
      {
        $sort: { "_id.date": 1 },
      },
    ]);

    // Calculate summary
    const allAnalyses = await EmotionAnalysis.find({
      user: user._id,
      analyzed_at: { $gte: startDate },
    });

    const emotionCounts: Record<string, number> = {};
    let totalConfidence = 0;

    allAnalyses.forEach((analysis) => {
      emotionCounts[analysis.dominant_emotion] =
        (emotionCounts[analysis.dominant_emotion] || 0) + 1;
      totalConfidence += analysis.confidence_score;
    });

    const mostCommonEmotion =
      Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";

    return {
      success: true,
      data: {
        trends,
        summary: {
          most_common_emotion: mostCommonEmotion,
          avg_confidence: allAnalyses.length > 0 ? totalConfidence / allAnalyses.length : 0,
          total_analyses: allAnalyses.length,
        },
      },
    };
  } catch (error) {
    console.error("Error getting emotion trends:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get emotion trends",
    };
  }
}

// ============================================
// GET RECENT EMOTIONS (cho recommendations)
// ============================================
export async function getRecentEmotions(limit: number = 20) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const recentAnalyses = await EmotionAnalysis.find({
      user: user._id,
    })
      .sort({ analyzed_at: -1 })
      .limit(limit)
      .select('dominant_emotion confidence_score emotion_scores analyzed_at')
      .lean();

    return {
      success: true,
      data: {
        emotions: recentAnalyses.map((ea) => ({
          emotion: ea.dominant_emotion,
          confidence: ea.confidence_score,
          scores: ea.emotion_scores,
          analyzed_at: ea.analyzed_at,
        })),
      },
    };
  } catch (error) {
    console.error("Error getting recent emotions:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get recent emotions",
    };
  }
}

// ============================================
// GET EMOTION HISTORY
// ============================================
export async function getEmotionHistory(params: GetEmotionHistoryParams = {}) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const { limit = 50, offset = 0, context, startDate, endDate } = params;

    // Build query
    const query: any = { user: user._id };

    if (context) {
      query.context = context;
    }

    if (startDate || endDate) {
      query.analyzed_at = {};
      if (startDate) query.analyzed_at.$gte = new Date(startDate);
      if (endDate) query.analyzed_at.$lte = new Date(endDate);
    }

    // Get total count
    const total = await EmotionAnalysis.countDocuments(query);

    // Get emotions with pagination
    const emotions = await EmotionAnalysis.find(query)
      .sort({ analyzed_at: -1 })
      .skip(offset)
      .limit(limit)
      .populate("message", "content encrypted_content")
      .populate("conversation", "type")
      .lean();

    return {
      success: true,
      data: {
        emotions: emotions as EmotionAnalysisDTO[],
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
    };
  } catch (error) {
    console.error("Error getting emotion history:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get emotion history",
    };
  }
}

// ============================================
// GET EMOTION STATISTICS
// ============================================
export async function getEmotionStats(params: GetEmotionStatsParams = {}) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const { days = 30 } = params;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get trends
    const trends = await EmotionAnalysis.aggregate([
      {
        $match: {
          user: user._id,
          analyzed_at: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            emotion: "$dominant_emotion",
            date: { $dateToString: { format: "%Y-%m-%d", date: "$analyzed_at" } },
          },
          count: { $sum: 1 },
          avg_confidence: { $avg: "$confidence_score" },
          avg_joy: { $avg: "$emotion_scores.joy" },
          avg_sadness: { $avg: "$emotion_scores.sadness" },
          avg_anger: { $avg: "$emotion_scores.anger" },
          avg_fear: { $avg: "$emotion_scores.fear" },
        },
      },
      {
        $sort: { "_id.date": 1 },
      },
    ]);

    // Get overall statistics
    const stats = await EmotionAnalysis.aggregate([
      {
        $match: {
          user: user._id,
          analyzed_at: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          total_analyses: { $sum: 1 },
          avg_joy: { $avg: "$emotion_scores.joy" },
          avg_sadness: { $avg: "$emotion_scores.sadness" },
          avg_anger: { $avg: "$emotion_scores.anger" },
          avg_fear: { $avg: "$emotion_scores.fear" },
          avg_surprise: { $avg: "$emotion_scores.surprise" },
          avg_neutral: { $avg: "$emotion_scores.neutral" },
          emotions: { $push: "$dominant_emotion" },
        },
      },
    ]);

    // Count dominant emotions
    const dominantEmotionsCount: { [key: string]: number } = {};
    if (stats[0]?.emotions) {
      stats[0].emotions.forEach((emotion: string) => {
        dominantEmotionsCount[emotion] = (dominantEmotionsCount[emotion] || 0) + 1;
      });
    }

    const result: EmotionStatsDTO = {
      total_analyses: stats[0]?.total_analyses || 0,
      dominant_emotions_count: dominantEmotionsCount,
      average_scores: {
        joy: stats[0]?.avg_joy || 0,
        sadness: stats[0]?.avg_sadness || 0,
        anger: stats[0]?.avg_anger || 0,
        fear: stats[0]?.avg_fear || 0,
        surprise: stats[0]?.avg_surprise || 0,
        neutral: stats[0]?.avg_neutral || 0,
      },
      trends: trends.map((trend: any) => ({
        date: trend._id.date,
        emotion: trend._id.emotion,
        count: trend.count,
        avg_confidence: trend.avg_confidence,
        avg_joy: trend.avg_joy,
        avg_sadness: trend.avg_sadness,
        avg_anger: trend.avg_anger,
        avg_fear: trend.avg_fear,
      })),
    };

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Error getting emotion stats:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get emotion stats",
    };
  }
}

// ============================================
// GET EMOTION PATTERNS
// ============================================
export async function getEmotionPatterns() {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const patterns = await EmotionAnalysis.aggregate([
      {
        $match: {
          user: user._id,
        },
      },
      {
        $addFields: {
          hour: { $hour: "$analyzed_at" },
          dayOfWeek: { $dayOfWeek: "$analyzed_at" },
        },
      },
      {
        $group: {
          _id: {
            emotion: "$dominant_emotion",
            hour: "$hour",
            dayOfWeek: "$dayOfWeek",
          },
          count: { $sum: 1 },
          avg_confidence: { $avg: "$confidence_score" },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    return {
      success: true,
      data: patterns,
    };
  } catch (error) {
    console.error("Error getting emotion patterns:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get emotion patterns",
    };
  }
}

// ============================================
// DELETE EMOTION ANALYSIS
// ============================================
export async function deleteEmotionAnalysis(emotionId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    await EmotionAnalysis.deleteOne({
      _id: emotionId,
      user: user._id,
    });

    return {
      success: true,
      message: "Emotion analysis deleted",
    };
  } catch (error) {
    console.error("Error deleting emotion analysis:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete emotion analysis",
    };
  }
}