/* eslint-disable @typescript-eslint/no-explicit-any */
// src/actions/emotion.actions.ts - FIXED VERSION
"use server";

import { HuggingFaceService } from "@/lib/services/huggingface.service";
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

// ============================================
// ANALYZE EMOTION FROM MESSAGE
// ============================================
export async function analyzeMessageEmotion(data: any) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const { text, messageId, conversationId, context } = data;

    console.log(`🤖 Analyzing emotion with AI for text: "${text.substring(0, 50)}..."`);

    // Use HuggingFace AI for emotion analysis
    const emotionResult = await HuggingFaceService.analyzeEmotion(text);

    console.log(`✅ Emotion detected: ${emotionResult.emotion} (${(emotionResult.score * 100).toFixed(0)}%) using ${emotionResult.method}`);

    // Create emotion analysis record
    const emotionAnalysis = await EmotionAnalysis.create({
      user: user._id,
      message: messageId ? new mongoose.Types.ObjectId(messageId) : undefined,
      conversation: conversationId
        ? new mongoose.Types.ObjectId(conversationId)
        : undefined,
      emotion_scores: emotionResult.allScores,
      dominant_emotion: emotionResult.emotion,
      confidence_score: emotionResult.score,
      text_analyzed: text,
      context,
    });

    // Generate AI recommendations for ALL emotions
    console.log(`💡 Generating AI recommendations for ${emotionResult.emotion}...`);
    
    const recommendations = await HuggingFaceService.generateEmotionRecommendations(
      user._id.toString(),
      emotionAnalysis
    );

    console.log(`✅ Generated ${recommendations.length} AI recommendations`);

    return {
      success: true,
      data: {
        ...emotionAnalysis.toObject(),
        recommendations,
        provider: {
          emotion: emotionResult.method,
          recommendations: 'huggingface-ai',
        },
      },
    };
  } catch (error) {
    console.error("Error analyzing emotion:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to analyze emotion",
    };
  }
}

// ============================================
// GET EMOTION TRENDS - FIXED (no model methods)
// ============================================
export async function getEmotionTrends(data: {
  userId: string;
  days?: number;
}) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const { days = 30 } = data;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Manual aggregation instead of model method
    const trends = await EmotionAnalysis.aggregate([
      {
        $match: {
          user: user._id,
          analyzed_at: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            emotion: '$dominant_emotion',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$analyzed_at' } }
          },
          count: { $sum: 1 },
          avg_confidence: { $avg: '$confidence_score' },
          avg_joy: { $avg: '$emotion_scores.joy' },
          avg_sadness: { $avg: '$emotion_scores.sadness' },
          avg_anger: { $avg: '$emotion_scores.anger' },
          avg_fear: { $avg: '$emotion_scores.fear' }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
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
      Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "neutral";

    return {
      success: true,
      data: {
        trends,
        summary: {
          most_common_emotion: mostCommonEmotion,
          avg_confidence:
            allAnalyses.length > 0 ? totalConfidence / allAnalyses.length : 0,
          total_analyses: allAnalyses.length,
        },
      },
    };
  } catch (error) {
    console.error("Error getting emotion trends:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get emotion trends",
    };
  }
}

// ============================================
// GET AI RECOMMENDATIONS - ƯU TIÊN XU HƯỚNG GẦN NHẤT
// ============================================
export async function getEmotionRecommendations(data: { userId: string }) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    // Lấy 20 phân tích gần nhất để phát hiện xu hướng
    const recentAnalyses = await EmotionAnalysis.find({
      user: user._id,
    })
      .sort({ analyzed_at: -1 })
      .limit(20);

    if (recentAnalyses.length === 0) {
      return {
        success: true,
        data: {
          recommendations: [
            "Start tracking your emotions by sharing your thoughts and feelings.",
            "Regular emotional check-ins help you understand your patterns better.",
            "I'll provide personalized AI-powered recommendations based on how you're feeling.",
          ],
          based_on: {
            recent_emotions: [],
            dominant_pattern: "no_data",
          },
        },
      };
    }

    // ============================================
    // LOGIC MỚI: Phát hiện xu hướng cảm xúc gần nhất
    // ============================================
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

    // 1. Tìm cảm xúc MẠNh trong 2 giờ gần nhất (ưu tiên cao nhất)
    const veryRecentStrongEmotions = recentAnalyses.filter(
      (a) =>
        a.analyzed_at >= twoHoursAgo &&
        a.confidence_score > 0.6 &&
        a.dominant_emotion !== "neutral"
    );

    // 2. Tìm cảm xúc MẠNH trong 4 giờ gần nhất
    const recentStrongEmotions = recentAnalyses.filter(
      (a) =>
        a.analyzed_at >= fourHoursAgo &&
        a.confidence_score > 0.6 &&
        a.dominant_emotion !== "neutral"
    );

    // 3. Phân tích 5 tin nhắn gần nhất để phát hiện xu hướng
    const last5Emotions = recentAnalyses.slice(0, 5);
    
    let targetAnalysis = recentAnalyses[0]; // Default: tin nhắn gần nhất
    let recommendationReason = "latest_message";

    // ============================================
    // QUYẾT ĐỊNH CẢM XÚC NÀO CẦN RECOMMEND
    // ============================================
    
    // Ưu tiên 1: Cảm xúc MẠNH trong 2 giờ gần nhất
    if (veryRecentStrongEmotions.length > 0) {
      // Tìm cảm xúc mạnh nhất
      targetAnalysis = veryRecentStrongEmotions.reduce((prev, current) =>
        current.confidence_score > prev.confidence_score ? current : prev
      );
      recommendationReason = "strong_emotion_last_2_hours";
      console.log(
        `🎯 Detected STRONG emotion in last 2 hours: ${targetAnalysis.dominant_emotion} (${(targetAnalysis.confidence_score * 100).toFixed(0)}%)`
      );
    }
    // Ưu tiên 2: Phát hiện XU HƯỚNG THAY ĐỔI đột ngột (ví dụ: neutral → anger)
    else if (last5Emotions.length >= 3) {
      const latestEmotion = last5Emotions[0].dominant_emotion;
      const previousEmotions = last5Emotions.slice(1, 5).map((a) => a.dominant_emotion);

      // Nếu cảm xúc mới nhất khác hẳn với 3-4 tin trước đó
      const isDifferentTrend = previousEmotions.filter((e) => e === latestEmotion).length <= 1;
      
      if (isDifferentTrend && latestEmotion !== "neutral") {
        targetAnalysis = last5Emotions[0];
        recommendationReason = "emotion_trend_shift";
        console.log(
          `📈 Detected EMOTION SHIFT: ${previousEmotions[0]} → ${latestEmotion}`
        );
      }
      // Nếu có nhiều cảm xúc tiêu cực liên tiếp
      else {
        const negativeEmotions = ["sadness", "anger", "fear"];
        const recentNegativeCount = last5Emotions
          .slice(0, 3)
          .filter((a) => negativeEmotions.includes(a.dominant_emotion)).length;

        if (recentNegativeCount >= 2) {
          const latestNegative = last5Emotions.find((a) =>
            negativeEmotions.includes(a.dominant_emotion)
          );
          if (latestNegative) {
            targetAnalysis = latestNegative;
            recommendationReason = "recurring_negative_pattern";
            console.log(
              `⚠️ Detected recurring negative emotions: ${latestNegative.dominant_emotion}`
            );
          }
        }
      }
    }
    // Ưu tiên 3: Cảm xúc MẠNH trong 4 giờ gần nhất
    else if (recentStrongEmotions.length > 0) {
      targetAnalysis = recentStrongEmotions[0];
      recommendationReason = "strong_emotion_last_4_hours";
      console.log(
        `🕐 Using strong emotion from last 4 hours: ${targetAnalysis.dominant_emotion}`
      );
    }

    console.log(
      `💡 Generating AI recommendations for ${targetAnalysis.dominant_emotion} (reason: ${recommendationReason})`
    );

    // Generate AI recommendations
    const recommendations =
      await HuggingFaceService.generateEmotionRecommendations(
        user._id.toString(),
        targetAnalysis
      );

    // Tính toán xu hướng gần đây (5 tin nhắn gần nhất)
    const recentTrend: Record<string, number> = {};
    last5Emotions.forEach((analysis, index) => {
      // Trọng số giảm dần: tin mới nhất = 1.0, tin cũ nhất = 0.2
      const weight = 1 - index * 0.2;
      recentTrend[analysis.dominant_emotion] =
        (recentTrend[analysis.dominant_emotion] || 0) + weight;
    });

    const trendingEmotion =
      Object.entries(recentTrend).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "neutral";

    console.log(
      `✅ Generated ${recommendations.length} AI recommendations (trending: ${trendingEmotion})`
    );

    return {
      success: true,
      data: {
        recommendations,
        based_on: {
          target_emotion: targetAnalysis.dominant_emotion,
          target_confidence: targetAnalysis.confidence_score,
          recommendation_reason: recommendationReason,
          recent_trend: trendingEmotion,
          recent_emotions: last5Emotions.map((a) => ({
            emotion: a.dominant_emotion,
            confidence: a.confidence_score,
            time_ago_minutes: Math.floor(
              (now.getTime() - a.analyzed_at.getTime()) / (1000 * 60)
            ),
          })),
          method: "ai-powered-trend-aware",
        },
      },
    };
  } catch (error) {
    console.error("Error getting recommendations:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get recommendations",
    };
  }
}

// ==========================================
// ASYNC EMOTION ANALYSIS FOR ALL USERS - FIXED
// ==========================================
export async function analyzeMessageEmotionsAsync(
  messageContent: string,
  messageId: string,
  conversationId: string,
  senderId: string,
  participants: any[]
) {
  try {
    console.log(`🔍 Starting AI emotion analysis for message: "${messageContent.substring(0, 50)}..."`);

    // 1. Run AI emotion analysis ONCE with proper logging
    const emotionResult = await HuggingFaceService.analyzeEmotion(
      messageContent
    );

    console.log(
      `✅ Emotion detected: ${emotionResult.emotion} (${(
        emotionResult.score * 100
      ).toFixed(0)}%) using method: ${emotionResult.method}`
    );

    // Log emotion scores for debugging
    console.log('📊 Emotion scores:', JSON.stringify(emotionResult.allScores, null, 2));

    // 2. Create EmotionAnalysis records for ALL participants
    const emotionAnalysisPromises = participants.map(
      async (participant: any) => {
        const participantId = participant._id.toString();
        const isSender = participantId === senderId;

        console.log(`💾 Saving emotion for ${isSender ? 'sender' : 'receiver'}: ${participant.full_name || participantId}`);

        // Create emotion analysis record
        const emotionAnalysis = await EmotionAnalysis.create({
          user: participantId,
          message: messageId,
          conversation: conversationId,
          emotion_scores: emotionResult.allScores,
          dominant_emotion: emotionResult.emotion,
          confidence_score: emotionResult.score,
          text_analyzed: messageContent,
          context: isSender ? "message" : "message",
        });

        console.log(
          `✅ Emotion saved: ${emotionAnalysis.dominant_emotion} (${(emotionAnalysis.confidence_score * 100).toFixed(0)}%)`
        );

        // 3. Emit emotion analysis to this specific user
        await emitSocketEvent(
          "emotionAnalysisComplete",
          conversationId,
          {
            user_id: participantId,
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

        // 4. Generate AI recommendations for high-confidence emotions
        if (emotionAnalysis.confidence_score > 0.6) {
          console.log(
            `💡 Generating AI recommendations for ${participant.full_name || participantId} (${emotionAnalysis.dominant_emotion})...`
          );

          const recommendations =
            await HuggingFaceService.generateEmotionRecommendations(
              participantId,
              emotionAnalysis
            );

          await emitSocketEvent(
            "sendRecommendations",
            conversationId,
            {
              user_id: participantId,
              message_id: messageId,
              emotion: emotionAnalysis.dominant_emotion,
              recommendations: recommendations.slice(0, 4),
              based_on: {
                emotion: emotionAnalysis.dominant_emotion,
                confidence: emotionAnalysis.confidence_score,
                context: isSender ? 'message_sent' : 'message_received',
                message_preview: messageContent.substring(0, 100) + "...",
              },
            },
            false
          );

          console.log(
            `📨 AI recommendations sent to ${isSender ? 'sender' : 'receiver'}: ${
              participant.full_name || participantId
            }`
          );
        }

        return emotionAnalysis;
      }
    );

    // Wait for all emotion analyses to complete
    const emotionAnalyses = await Promise.all(emotionAnalysisPromises);

    console.log(
      `✅ Emotion analysis completed for ${emotionAnalyses.length} users`
    );
  } catch (error) {
    console.error("❌ Error in async emotion analysis:", error);
    // Don't throw - this is background processing
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
      .populate("message", "content")
      .populate("conversation", "title")
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
      error:
        error instanceof Error
          ? error.message
          : "Failed to get emotion history",
    };
  }
}

// ============================================
// GET EMOTION STATISTICS - FIXED
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

    // Manual aggregation for trends
    const trends = await EmotionAnalysis.aggregate([
      {
        $match: {
          user: user._id,
          analyzed_at: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            emotion: '$dominant_emotion',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$analyzed_at' } }
          },
          count: { $sum: 1 },
          avg_confidence: { $avg: '$confidence_score' },
          avg_joy: { $avg: '$emotion_scores.joy' },
          avg_sadness: { $avg: '$emotion_scores.sadness' },
          avg_anger: { $avg: '$emotion_scores.anger' },
          avg_fear: { $avg: '$emotion_scores.fear' }
        }
      },
      {
        $sort: { '_id.date': 1 }
      }
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
        dominantEmotionsCount[emotion] =
          (dominantEmotionsCount[emotion] || 0) + 1;
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
      error:
        error instanceof Error ? error.message : "Failed to get emotion stats",
    };
  }
}

// ============================================
// GET EMOTION PATTERNS - FIXED
// ============================================
export async function getEmotionPatterns() {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    // Manual aggregation instead of model method
    const patterns = await EmotionAnalysis.aggregate([
      {
        $match: {
          user: user._id
        }
      },
      {
        $addFields: {
          hour: { $hour: '$analyzed_at' },
          dayOfWeek: { $dayOfWeek: '$analyzed_at' }
        }
      },
      {
        $group: {
          _id: {
            emotion: '$dominant_emotion',
            hour: '$hour',
            dayOfWeek: '$dayOfWeek'
          },
          count: { $sum: 1 },
          avg_confidence: { $avg: '$confidence_score' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    return {
      success: true,
      data: patterns,
    };
  } catch (error) {
    console.error("Error getting emotion patterns:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get emotion patterns",
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
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete emotion analysis",
    };
  }
}