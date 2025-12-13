/* eslint-disable @typescript-eslint/no-explicit-any */
// src/actions/ai-chat.unified.action.ts - UNIFIED VERSION
"use server";

import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "../mongoose";
import User from "@/database/user.model";
import AIChatHistory from "@/database/ai-chat-history.model";
import EmotionAnalysis from "@/database/emotion-analysis.model";
import { emitToUserRoom } from "../socket.helper";
import { geminiService } from "../services/germini.service";

// ============================================
// INTERFACES
// ============================================
interface EmotionContext {
  recentEmotions: Array<{
    emotion: string;
    confidence: number;
    timestamp: Date;
  }>;
  dominantEmotion: string;
  emotionIntensity: number;
  emotionTrends: string[];
  avgConfidence: number;
}

// ============================================
// HELPER: Get User Emotion Context
// ============================================
async function getUserEmotionContext(userId: any): Promise<EmotionContext | undefined> {
  try {
    const recentEmotions = await EmotionAnalysis.find({ user: userId })
      .sort({ analyzed_at: -1 })
      .limit(20)
      .lean();

    if (recentEmotions.length === 0) return undefined;

    const totalIntensity = recentEmotions.reduce(
      (sum, e) => sum + e.confidence_score,
      0
    );

    return {
      recentEmotions: recentEmotions.map((e) => ({
        emotion: e.dominant_emotion,
        confidence: e.confidence_score,
        timestamp: e.analyzed_at,
      })),
      dominantEmotion: recentEmotions[0].dominant_emotion,
      emotionIntensity: totalIntensity / recentEmotions.length,
      emotionTrends: recentEmotions.slice(0, 10).map((e) => e.dominant_emotion),
      avgConfidence: totalIntensity / recentEmotions.length,
    };
  } catch (error) {
    console.error("Error getting emotion context:", error);
    return undefined;
  }
}

// ============================================
// HELPER: Check and Send Emotion Alert
// ============================================
async function checkEmotionAlert(
  userClerkId: string,
  dominantEmotion: string,
  confidenceScore: number,
  language: "vi" | "en" | "zh"
) {
  const negativeEmotions = ["sadness", "anger", "fear"];
  const isNegative = negativeEmotions.includes(dominantEmotion);
  const isIntense = confidenceScore > 0.75;

  if (!isNegative || !isIntense) return;

  console.log(
    `🚨 Strong negative emotion: ${dominantEmotion} (${(
      confidenceScore * 100
    ).toFixed(0)}%)`
  );

  try {
    const user = await User.findOne({ clerkId: userClerkId });
    if (!user) return;

    const emotionContext = await getUserEmotionContext(user._id);
    if (!emotionContext) return;

    const recommendation = await geminiService.analyzeAndRecommend(
      emotionContext,
      language
    );

    await emitToUserRoom("emotionAlert", userClerkId, {
      type: "strong_negative_emotion",
      emotion: dominantEmotion,
      intensity: confidenceScore,
      recommendation: recommendation.recommendation,
      supportMessage: recommendation.supportMessage,
      actionSuggestion: recommendation.actionSuggestion,
      language,
      timestamp: new Date(),
    });

    console.log(`✅ Emotion alert sent to user ${userClerkId}`);
  } catch (error) {
    console.error("❌ Error sending emotion alert:", error);
  }
}

// ============================================
// 📨 SEND MESSAGE
// ============================================
export async function sendAIMessage(data: {
  message: string;
  conversationId?: string;
  includeEmotionContext?: boolean;
  language?: "vi" | "en" | "zh";
}) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const {
      message,
      conversationId,
      includeEmotionContext = true,
      language,
    } = data;

    // Generate conversation ID
    const chatConvId = conversationId || `ai_chat_${user._id}_${Date.now()}`;

    // 🔔 Emit: AI is typing
    await emitToUserRoom("aiTyping", user.clerkId, {
      conversation_id: chatConvId,
      is_typing: true,
    });

    // Get or create chat history
    let chatHistory = await AIChatHistory.findOne({
      user: user._id,
      conversation_id: chatConvId,
    });

    const isNewChat = !chatHistory;

    if (!chatHistory) {
      chatHistory = await AIChatHistory.create({
        user: user._id,
        conversation_id: chatConvId,
        messages: [],
        metadata: {
          language_preference: language || "vi",
        },
      });
    }

    // Get emotion context with full details
    let emotionContext;
    let currentEmotionData;
    if (includeEmotionContext) {
      emotionContext = await getUserEmotionContext(user._id);
      if (emotionContext) {
        currentEmotionData = {
          emotion: emotionContext.dominantEmotion,
          confidence: emotionContext.avgConfidence,
          trends: emotionContext.emotionTrends,
          intensity: emotionContext.emotionIntensity,
        };

        chatHistory.emotion_context = {
          dominant_emotion: emotionContext.dominantEmotion,
          recent_emotions: emotionContext.emotionTrends,
          avg_confidence: emotionContext.avgConfidence,
        };

        // Check for emotion alert
        await checkEmotionAlert(
          user.clerkId,
          emotionContext.dominantEmotion,
          emotionContext.avgConfidence,
          language || "vi"
        );
      }
    }

    // Add user message
    chatHistory.messages.push({
      role: "user",
      content: message,
      language: language,
      timestamp: new Date(),
    });

    // Get AI response with emotion-aware context
    const conversationHistory = chatHistory.messages
      .slice(-10)
      .map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const { response: aiResponse, detectedLanguage } =
      await geminiService.chat(
        message,
        conversationHistory,
        emotionContext,
        language || chatHistory.metadata?.language_preference
      );

    // Update language preference
    if (!chatHistory.metadata) chatHistory.metadata = {};
    chatHistory.metadata.language_preference = detectedLanguage;

    // Add AI response
    chatHistory.messages.push({
      role: "assistant",
      content: aiResponse,
      language: detectedLanguage,
      timestamp: new Date(),
    });

    // Auto-generate title for new chat
    if (isNewChat && !chatHistory.title) {
      try {
        chatHistory.title = await geminiService.generateChatTitle(
          message,
          detectedLanguage
        );
      } catch {
        chatHistory.title = message.slice(0, 30) + "...";
      }
    }

    await chatHistory.save();

    // 🔔 Stop typing
    await emitToUserRoom("aiTyping", user.clerkId, {
      conversation_id: chatConvId,
      is_typing: false,
    });

    // 🔔 Send AI response with emotion context
    await emitToUserRoom("aiChatResponse", user.clerkId, {
      conversation_id: chatConvId,
      message: aiResponse,
      language: detectedLanguage,
      emotion_context: currentEmotionData,
      timestamp: new Date(),
    });

    console.log(`✅ AI response sent (${detectedLanguage})`);

    return {
      success: true,
      data: {
        message: aiResponse,
        conversation_id: chatConvId,
        language: detectedLanguage,
        title: chatHistory.title,
        emotion_context: currentEmotionData,
        timestamp: new Date(),
      },
    };
  } catch (error) {
    console.error("❌ Error in AI chat:", error);

    try {
      const { userId } = await auth();
      if (userId) {
        const user = await User.findOne({ clerkId: userId });
        if (user) {
          await emitToUserRoom("aiChatError", user.clerkId, {
            error:
              error instanceof Error
                ? error.message
                : "Failed to send message",
          });

          await emitToUserRoom("aiTyping", user.clerkId, {
            is_typing: false,
          });
        }
      }
    } catch {}

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send message",
    };
  }
}

// ============================================
// 📜 GET CHAT HISTORY
// ============================================
export async function getChatHistory(data: {
  conversationId: string;
  page?: number;
  limit?: number;
}) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const { conversationId, page = 1, limit = 50 } = data;

    const chatHistory = await AIChatHistory.findOne({
      user: user._id,
      conversation_id: conversationId,
    });

    if (!chatHistory) {
      return {
        success: true,
        data: {
          messages: [],
          title: null,
          emotion_context: null,
          pagination: { page, limit, total: 0, hasMore: false },
        },
      };
    }

    const total = chatHistory.messages.length;
    const startIndex = Math.max(0, total - page * limit);
    const endIndex = total - (page - 1) * limit;
    const messages = chatHistory.messages.slice(startIndex, endIndex);

    return {
      success: true,
      data: {
        messages: messages.map((m: any) => ({
          role: m.role,
          content: m.content,
          language: m.language,
          emotion: m.emotion_detected,
          timestamp: m.timestamp,
        })),
        title: chatHistory.title,
        emotion_context: chatHistory.emotion_context,
        pagination: {
          page,
          limit,
          total,
          hasMore: startIndex > 0,
        },
      },
    };
  } catch (error) {
    console.error("❌ Error getting chat history:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get history",
    };
  }
}

// ============================================
// 📋 GET ALL CONVERSATIONS (for sidebar)
// ============================================
export async function getAllConversations(data?: {
  limit?: number;
  offset?: number;
}) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const { limit = 50, offset = 0 } = data || {};

    const total = await AIChatHistory.countDocuments({ user: user._id });

    const conversations = await AIChatHistory.find({ user: user._id })
      .sort({ updated_at: -1 })
      .skip(offset)
      .limit(limit)
      .select(
        "conversation_id title messages updated_at emotion_context metadata"
      )
      .lean();

    return {
      success: true,
      data: {
        conversations: conversations.map((conv: any) => ({
          conversation_id: conv.conversation_id,
          title: conv.title || "Untitled Chat",
          preview:
            conv.messages[conv.messages.length - 1]?.content?.slice(0, 50) ||
            "",
          last_updated: conv.updated_at,
          message_count: conv.messages.length,
          emotion_context: conv.emotion_context,
          language: conv.metadata?.language_preference || "vi",
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      },
    };
  } catch (error) {
    console.error("❌ Error getting conversations:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get conversations",
    };
  }
}

// ============================================
// 🗑️ DELETE CONVERSATION
// ============================================
export async function deleteConversation(conversationId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    await AIChatHistory.deleteOne({
      user: user._id,
      conversation_id: conversationId,
    });

    return {
      success: true,
      message: "Conversation deleted",
    };
  } catch (error) {
    console.error("❌ Error deleting conversation:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete",
    };
  }
}

// ============================================
// 💡 GET EMOTION RECOMMENDATION
// ============================================
export async function getEmotionRecommendation(
  language: "vi" | "en" | "zh" = "vi"
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const emotionContext = await getUserEmotionContext(user._id);

    if (!emotionContext) {
      return {
        success: false,
        error: "No emotion data available",
      };
    }

    const recommendation = await geminiService.analyzeAndRecommend(
      emotionContext,
      language
    );

    return {
      success: true,
      data: {
        currentEmotion: emotionContext.dominantEmotion,
        emotionIntensity: emotionContext.emotionIntensity,
        emotionTrends: emotionContext.emotionTrends,
        recommendation: recommendation.recommendation,
        supportMessage: recommendation.supportMessage,
        actionSuggestion: recommendation.actionSuggestion,
        language,
        generatedAt: new Date(),
      },
    };
  } catch (error) {
    console.error("❌ Error getting recommendation:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get recommendation",
    };
  }
}