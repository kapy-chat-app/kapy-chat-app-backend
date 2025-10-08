/* eslint-disable @typescript-eslint/no-explicit-any */
// src/actions/emotion.actions.ts (FINAL VERSION)
"use server";

import { HuggingFaceService } from "@/lib/services/huggingface.service";
import { AI_CONFIG, getActiveProvider } from "@/lib/config/ai.config";
import { auth } from "@clerk/nextjs/server";
import mongoose from "mongoose";
import EmotionAnalysis from "@/database/emotion-analysis.model";
import { connectToDatabase } from "../mongoose";
import User from "@/database/user.model";

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

    let emotionResult;
    const provider = getActiveProvider("emotion");

    console.log(`🤖 Using ${provider} for emotion analysis`);

    // Use appropriate provider
    switch (provider) {
      case "openai":
        try {
          emotionResult = await OpenAIService.analyzeEmotion(text);
        } catch (error) {
          console.log("⚠️ OpenAI failed, falling back to template");
          emotionResult = await HuggingFaceService.analyzeEmotion(text);
        }
        break;

      case "huggingface":
        try {
          emotionResult = await HuggingFaceService.analyzeEmotion(text);
        } catch (error) {
          console.log("⚠️ HuggingFace failed, using template");
          emotionResult = await HuggingFaceService.analyzeEmotion(text);
        }
        break;

      default: // template
        emotionResult = await HuggingFaceService.analyzeEmotion(text);
        break;
    }

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

    // Generate recommendations
    let recommendations = [];
    const recProvider = getActiveProvider("recommendations");

    console.log(`💡 Using ${recProvider} for recommendations`);

    switch (recProvider) {
      case "openai":
        try {
          recommendations = await OpenAIService.generateRecommendations(
            emotionAnalysis,
            AI_CONFIG.TEMPLATE.RECOMMENDATIONS_COUNT
          );
        } catch (error) {
          console.log("⚠️ OpenAI recommendations failed, using template");
          recommendations =
            await HuggingFaceService.generateEmotionRecommendations(
              user._id.toString(),
              emotionAnalysis
            );
        }
        break;

      default: // template or huggingface
        recommendations =
          await HuggingFaceService.generateEmotionRecommendations(
            user._id.toString(),
            emotionAnalysis
          );
        break;
    }

    console.log(
      `✅ Emotion: ${emotionAnalysis.dominant_emotion} (${(
        emotionAnalysis.confidence_score * 100
      ).toFixed(0)}%)`
    );
    console.log(`✅ Recommendations: ${recommendations.length} items`);

    return {
      success: true,
      data: {
        ...emotionAnalysis.toObject(),
        recommendations,
        provider: {
          emotion: provider,
          recommendations: recProvider,
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
// GET EMOTION TRENDS
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

    const trends = await EmotionAnalysis.getUserEmotionTrends(
      user._id.toString(),
      days
    );

    // Calculate summary
    const allAnalyses = await EmotionAnalysis.find({
      user: user._id,
      analyzed_at: {
        $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      },
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

    // Get AI insights if using OpenAI
    let aiInsights = "";
    if (getActiveProvider("chat") === "openai" && trends.length > 0) {
      try {
        aiInsights = await OpenAIService.analyzeEmotionTrends(
          trends,
          `${days} days`
        );
      } catch (error) {
        console.log("Could not generate AI insights");
      }
    }

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
        ai_insights: aiInsights,
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
// GET PERSONALIZED RECOMMENDATIONS
// ============================================
export async function getEmotionRecommendations(data: { userId: string }) {
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
      .limit(10);

    if (recentAnalyses.length === 0) {
      return {
        success: true,
        data: {
          recommendations: [
            "Start tracking your emotions by sending messages",
            "Share your feelings to get personalized insights",
            "Regular emotional check-ins help maintain wellness",
          ],
          based_on: {
            recent_emotions: [],
            dominant_pattern: "no_data",
          },
        },
      };
    }

    const latestAnalysis = recentAnalyses[0];

    // Use appropriate provider
    let recommendations = [];
    const provider = getActiveProvider("recommendations");

    console.log(`💡 Getting recommendations using ${provider}`);

    switch (provider) {
      case "openai":
        try {
          recommendations = await OpenAIService.generateRecommendations(
            latestAnalysis,
            AI_CONFIG.TEMPLATE.RECOMMENDATIONS_COUNT
          );
        } catch (error) {
          console.log("⚠️ OpenAI failed, using template");
          recommendations =
            await HuggingFaceService.generateEmotionRecommendations(
              user._id.toString(),
              latestAnalysis
            );
        }
        break;

      default: // template
        recommendations =
          await HuggingFaceService.generateEmotionRecommendations(
            user._id.toString(),
            latestAnalysis
          );
        break;
    }

    const emotionCounts: Record<string, number> = {};
    recentAnalyses.forEach((analysis) => {
      emotionCounts[analysis.dominant_emotion] =
        (emotionCounts[analysis.dominant_emotion] || 0) + 1;
    });

    const dominantPattern =
      Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "neutral";

    console.log(
      `✅ Generated ${recommendations.length} recommendations for ${dominantPattern}`
    );

    return {
      success: true,
      data: {
        recommendations,
        based_on: {
          recent_emotions: recentAnalyses.map((a) => a.dominant_emotion),
          dominant_pattern: dominantPattern,
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
