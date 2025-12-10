/* eslint-disable @typescript-eslint/no-explicit-any */
// src/actions/ai-chat.actions.ts
"use server";

import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "../mongoose";
import User from "@/database/user.model";
import AIChatHistory from "@/database/ai-chat-history.model";
import EmotionAnalysis from "@/database/emotion-analysis.model";
import { emitToUserRoom } from "../socket.helper";
import { ollamaService } from "../services/ollama.service";

/**
 * ⭐ Gửi tin nhắn đến AI Chatbot
 */
export async function sendAIChatMessage(data: {
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

    // Get emotion context
    let emotionContext;
    if (includeEmotionContext) {
      const recentEmotions = await EmotionAnalysis.find({ user: user._id })
        .sort({ analyzed_at: -1 })
        .limit(10)
        .lean();

      if (recentEmotions.length > 0) {
        const totalIntensity = recentEmotions.reduce(
          (sum, e) => sum + e.confidence_score,
          0
        );

        emotionContext = {
          recentEmotions: recentEmotions.map((e) => ({
            emotion: e.dominant_emotion,
            confidence: e.confidence_score,
            timestamp: e.analyzed_at,
          })),
          dominantEmotion: recentEmotions[0].dominant_emotion,
          emotionIntensity: totalIntensity / recentEmotions.length,
        };

        chatHistory.emotion_context = {
          dominant_emotion: recentEmotions[0].dominant_emotion,
          recent_emotions: recentEmotions
            .slice(0, 5)
            .map((e) => e.dominant_emotion),
          avg_confidence: totalIntensity / recentEmotions.length,
        };
      }
    }

    // Add user message
    chatHistory.messages.push({
      role: "user",
      content: message,
      language: language,
      timestamp: new Date(),
    });

    // Get AI response
    const conversationHistory = chatHistory.messages.slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const { response: aiResponse, detectedLanguage } = await ollamaService.chat(
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
        chatHistory.title = await ollamaService.generateChatTitle(
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

    // 🔔 Send AI response
    await emitToUserRoom("aiChatResponse", user.clerkId, {
      conversation_id: chatConvId,
      message: aiResponse,
      language: detectedLanguage,
      emotion_context: emotionContext?.dominantEmotion,
      timestamp: new Date(),
    });

    console.log(`✅ AI chat response sent (${detectedLanguage})`);

    return {
      success: true,
      data: {
        message: aiResponse,
        conversation_id: chatConvId,
        language: detectedLanguage,
        title: chatHistory.title,
        emotion_detected: emotionContext?.dominantEmotion,
        timestamp: new Date(),
      },
    };
  } catch (error) {
    console.error("❌ Error in AI chat:", error);

    // 🔔 Emit error
    try {
      const { userId } = await auth();
      if (userId) {
        const user = await User.findOne({ clerkId: userId });
        if (user) {
          await emitToUserRoom("aiChatError", user.clerkId, {
            error:
              error instanceof Error ? error.message : "Failed to send message",
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

/**
 * ⭐ Lấy lịch sử chat
 */
export async function getAIChatHistory(data: {
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

/**
 * ⭐ Lấy tất cả cuộc trò chuyện
 */
export async function getAllAIChatConversations() {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const conversations = await AIChatHistory.find({ user: user._id })
      .sort({ updated_at: -1 })
      .select(
        "conversation_id title messages updated_at emotion_context metadata"
      )
      .lean();

    return {
      success: true,
      data: conversations.map((conv: any) => ({
        conversation_id: conv.conversation_id,
        title: conv.title,
        last_message: conv.messages[conv.messages.length - 1]?.content || "",
        last_updated: conv.updated_at,
        message_count: conv.messages.length,
        emotion_context: conv.emotion_context,
        language: conv.metadata?.language_preference || "vi",
      })),
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

/**
 * ⭐ Xóa cuộc trò chuyện
 */
export async function deleteAIChatConversation(conversationId: string) {
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

/**
 * ⭐ Lấy gợi ý cảm xúc từ AI
 */
export async function getEmotionRecommendation(
  language: "vi" | "en" | "zh" = "vi"
) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    // Lấy 10 cảm xúc gần nhất
    const recentEmotions = await EmotionAnalysis.find({ user: user._id })
      .sort({ analyzed_at: -1 })
      .limit(10)
      .lean();

    if (recentEmotions.length === 0) {
      return {
        success: false,
        error: "No emotion data available",
      };
    }

    const totalIntensity = recentEmotions.reduce(
      (sum, e) => sum + e.confidence_score,
      0
    );
    const avgIntensity = totalIntensity / recentEmotions.length;

    const emotionContext = {
      recentEmotions: recentEmotions.map((e) => ({
        emotion: e.dominant_emotion,
        confidence: e.confidence_score,
        timestamp: e.analyzed_at,
      })),
      dominantEmotion: recentEmotions[0].dominant_emotion,
      emotionIntensity: avgIntensity,
    };

    // Gọi AI
    const recommendation = await ollamaService.analyzeAndRecommend(
      emotionContext,
      language
    );

    return {
      success: true,
      data: {
        currentEmotion: recentEmotions[0].dominant_emotion,
        emotionIntensity: avgIntensity,
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

/**
 * ⭐ REALTIME: Kiểm tra và gửi alert khi cảm xúc mạnh
 */
export async function checkAndSendEmotionAlert(emotionData: {
  userId: string;
  dominantEmotion: string;
  confidenceScore: number;
  language?: "vi" | "en" | "zh";
}) {
  try {
    const {
      userId,
      dominantEmotion,
      confidenceScore,
      language = "vi",
    } = emotionData;

    // Chỉ alert khi cảm xúc tiêu cực và rất mạnh
    const negativeEmotions = ["sadness", "anger", "fear"];
    const isNegative = negativeEmotions.includes(dominantEmotion);
    const isIntense = confidenceScore > 0.75;

    if (!isNegative || !isIntense) {
      return { success: true, alerted: false };
    }

    console.log(
      `🚨 Strong negative emotion: ${dominantEmotion} (${(
        confidenceScore * 100
      ).toFixed(0)}%)`
    );

    await connectToDatabase();
    const user = await User.findOne({ clerkId: userId });
    if (!user) return { success: false };

    // Get emotion context
    const recentEmotions = await EmotionAnalysis.find({ user: user._id })
      .sort({ analyzed_at: -1 })
      .limit(10)
      .lean();

    const totalIntensity = recentEmotions.reduce(
      (sum, e) => sum + e.confidence_score,
      0
    );

    const emotionContext = {
      recentEmotions: recentEmotions.map((e) => ({
        emotion: e.dominant_emotion,
        confidence: e.confidence_score,
        timestamp: e.analyzed_at,
      })),
      dominantEmotion,
      emotionIntensity: totalIntensity / recentEmotions.length,
    };

    // Gọi AI
    const recommendation = await ollamaService.analyzeAndRecommend(
      emotionContext,
      language
    );

    // 🔔 Gửi qua socket
    await emitToUserRoom("emotionAlert", userId, {
      type: "strong_negative_emotion",
      emotion: dominantEmotion,
      intensity: confidenceScore,
      recommendation: recommendation.recommendation,
      supportMessage: recommendation.supportMessage,
      actionSuggestion: recommendation.actionSuggestion,
      language,
      timestamp: new Date(),
    });

    console.log(`✅ Emotion alert sent to user ${userId}`);

    return {
      success: true,
      alerted: true,
      recommendation,
    };
  } catch (error) {
    console.error("❌ Error sending alert:", error);
    return { success: false, error };
  }
}
