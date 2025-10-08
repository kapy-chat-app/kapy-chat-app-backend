// ============================================
// SEND MESSAGE TO AI CHATBOT

import ChatHistory from "@/database/chatbot-history";
import EmotionAnalysis from "@/database/emotion-analysis.model";
import MoodEntry from "@/database/mood-entry.model";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "../mongoose";
import { HuggingFaceService } from "../services/huggingface.service";
import { emitSocketEvent } from "../socket.helper";
import User from "@/database/user.model";

// ============================================
export async function sendChatMessage(data: {
  message: string;
  conversationId?: string;
  includeEmotionContext?: boolean;
}) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const { message, conversationId, includeEmotionContext = true } = data;

    // Generate conversation ID if not provided
    const chatConvId = conversationId || `ai_chat_${user._id}_${Date.now()}`;

    // ==========================================
    // 🆕 EMIT: AI is typing
    // ==========================================
    await emitSocketEvent(
      "aiTyping",
      user._id.toString(),
      {
        conversation_id: chatConvId,
        is_typing: true,
      },
      false
    );

    // Analyze emotion from message
    let emotionDetected;
    if (includeEmotionContext) {
      try {
        const emotionResult = await HuggingFaceService.analyzeEmotion(message);
        emotionDetected = emotionResult.emotion;

        // Save emotion analysis
        const emotionAnalysis = await EmotionAnalysis.create({
          user: user._id,
          emotion_scores: emotionResult.allScores,
          dominant_emotion: emotionResult.emotion,
          confidence_score: emotionResult.score,
          text_analyzed: message,
          context: "ai_chat",
        });

        // ==========================================
        // 🆕 EMIT: Emotion analysis complete
        // ==========================================
        await emitSocketEvent(
          "emotionAnalyzed",
          user._id.toString(),
          {
            message_id: null, // This is AI chat, not a regular message
            conversation_id: chatConvId,
            emotion: emotionAnalysis.dominant_emotion,
            confidence: emotionAnalysis.confidence_score,
            all_scores: emotionAnalysis.emotion_scores,
            timestamp: new Date(),
          },
          false
        );

        console.log(`✅ Emotion detected: ${emotionDetected}`);
      } catch (error) {
        console.error("Error analyzing emotion:", error);
      }
    }

    // Get or create chat history
    let chatHistory = await ChatHistory.findOne({
      user: user._id,
      conversation_id: chatConvId,
    });

    if (!chatHistory) {
      chatHistory = await ChatHistory.create({
        user: user._id,
        conversation_id: chatConvId,
        messages: [],
      });
    }

    // Add user message to history
    chatHistory.messages.push({
      role: "user",
      content: message,
      emotion_detected: emotionDetected,
      timestamp: new Date(),
    });

    // Get user emotion context
    let userEmotionData;
    if (includeEmotionContext) {
      const recentEmotions = await EmotionAnalysis.find({
        user: user._id,
      })
        .sort({ analyzed_at: -1 })
        .limit(5);

      const recentMoods = await MoodEntry.find({
        user: user._id,
      })
        .sort({ created_at: -1 })
        .limit(3);

      userEmotionData = {
        dominant_emotion: recentEmotions[0]?.dominant_emotion,
        emotion_trends: recentEmotions.map((e) => e.dominant_emotion),
        mood_patterns: recentMoods.map((m) => ({
          score: m.mood_score,
          tags: m.mood_tags,
        })),
      };
    }

    // Get AI response
    const chatMessages = chatHistory.messages.slice(-10).map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    const aiResponse = await HuggingFaceService.getChatResponse(
      chatMessages,
      userEmotionData
    );

    // Add AI response to history
    chatHistory.messages.push({
      role: "assistant",
      content: aiResponse,
      timestamp: new Date(),
    });

    chatHistory.updated_at = new Date();
    await chatHistory.save();

    // Generate suggestions based on emotion
    let suggestions = [];
    if (
      emotionDetected &&
      ["sadness", "anger", "fear"].includes(emotionDetected)
    ) {
      suggestions = await HuggingFaceService.generateEmotionRecommendations(
        user._id.toString(),
        {
          dominant_emotion: emotionDetected,
          emotion_scores: { [emotionDetected]: 0.8 },
          confidence_score: 0.8,
        }
      );

      // ==========================================
      // 🆕 EMIT: Send recommendations
      // ==========================================
      if (suggestions.length > 0) {
        await emitSocketEvent(
          "emotionRecommendations",
          user._id.toString(),
          {
            recommendations: suggestions.slice(0, 3),
            based_on: {
              emotion: emotionDetected,
              confidence: 0.8,
            },
            timestamp: new Date(),
          },
          false
        );
      }
    }

    // ==========================================
    // 🆕 EMIT: AI typing stopped
    // ==========================================
    await emitSocketEvent(
      "aiTyping",
      user._id.toString(),
      {
        conversation_id: chatConvId,
        is_typing: false,
      },
      false
    );

    // ==========================================
    // 🆕 EMIT: AI response ready
    // ==========================================
    await emitSocketEvent(
      "aiChatResponse",
      user._id.toString(),
      {
        conversation_id: chatConvId,
        message: aiResponse,
        emotion_detected: emotionDetected,
        suggestions: suggestions.slice(0, 3),
        timestamp: new Date(),
      },
      false
    );

    console.log(`✅ AI chat response sent to user ${user._id}`);

    return {
      success: true,
      data: {
        message: aiResponse,
        emotion_detected: emotionDetected,
        suggestions: suggestions.slice(0, 3),
        timestamp: new Date(),
        conversation_id: chatConvId,
      },
    };
  } catch (error) {
    console.error("Error sending chat message:", error);

    // ==========================================
    // 🆕 EMIT: Error occurred
    // ==========================================
    try {
      const { userId } = await auth();
      if (userId) {
        const user = await User.findOne({ clerkId: userId });
        if (user) {
          await emitSocketEvent(
            "aiChatError",
            user._id.toString(),
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to send message",
              timestamp: new Date(),
            },
            false
          );

          // Stop typing indicator on error
          await emitSocketEvent(
            "aiTyping",
            user._id.toString(),
            {
              is_typing: false,
            },
            false
          );
        }
      }
    } catch (emitError) {
      console.error("Error emitting error event:", emitError);
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send message",
    };
  }
}

// ============================================
// GET CHAT HISTORY
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

    const chatHistory = await ChatHistory.findOne({
      user: user._id,
      conversation_id: conversationId,
    });

    if (!chatHistory) {
      return {
        success: true,
        data: {
          messages: [],
          pagination: {
            page,
            limit,
            total: 0,
            hasMore: false,
          },
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
          timestamp: m.timestamp,
          emotion: m.emotion_detected,
        })),
        pagination: {
          page,
          limit,
          total,
          hasMore: startIndex > 0,
        },
      },
    };
  } catch (error) {
    console.error("Error getting chat history:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get chat history",
    };
  }
}

// ============================================
// DELETE CHAT CONVERSATION
// ============================================
export async function deleteChatConversation(conversationId: string) {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    await ChatHistory.deleteOne({
      user: user._id,
      conversation_id: conversationId,
    });

    return {
      success: true,
      message: "Chat conversation deleted",
    };
  } catch (error) {
    console.error("Error deleting chat conversation:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete conversation",
    };
  }
}

// ============================================
// GET ALL CHAT CONVERSATIONS
// ============================================
export async function getAllChatConversations() {
  try {
    await connectToDatabase();
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");

    const user = await User.findOne({ clerkId: userId });
    if (!user) throw new Error("User not found");

    const conversations = await ChatHistory.find({
      user: user._id,
    })
      .sort({ updated_at: -1 })
      .select("conversation_id messages updated_at");

    return {
      success: true,
      data: conversations.map((conv: any) => ({
        conversation_id: conv.conversation_id,
        last_message: conv.messages[conv.messages.length - 1]?.content || "",
        last_updated: conv.updated_at,
        message_count: conv.messages.length,
      })),
    };
  } catch (error) {
    console.error("Error getting chat conversations:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get conversations",
    };
  }
}
