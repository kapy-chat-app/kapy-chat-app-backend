/* eslint-disable @typescript-eslint/no-explicit-any */
// src/types/dtos/emotion.dto.ts

export interface AnalyzeEmotionDTO {
  text?: string;
  messageId?: string;
  conversationId?: string;
  audioBuffer?: Buffer;
  context: 'message' | 'voice_note' | 'call' | 'general';
}

export interface EmotionAnalysisResponseDTO {
  success: boolean;
  data?: {
    _id: string;
    user: string;
    message?: string;
    conversation?: string;
    emotion_scores: {
      joy: number;
      sadness: number;
      anger: number;
      fear: number;
      surprise: number;
      neutral: number;
    };
    dominant_emotion: string;
    confidence_score: number;
    text_analyzed?: string;
    audio_features?: any;
    context: string;
    analyzed_at: Date;
    recommendations?: string[];
  };
  error?: string;
}

export interface GetEmotionTrendsDTO {
  userId: string;
  days?: number;
}

export interface EmotionTrendsResponseDTO {
  success: boolean;
  data?: {
    trends: any[];
    summary: {
      most_common_emotion: string;
      avg_confidence: number;
      total_analyses: number;
    };
  };
  error?: string;
}

export interface GetEmotionRecommendationsDTO {
  userId: string;
}

export interface EmotionRecommendationsResponseDTO {
  success: boolean;
  data?: {
    recommendations: string[];
    based_on: {
      recent_emotions: string[];
      dominant_pattern: string;
    };
  };
  error?: string;
}

// Chat DTOs
export interface SendChatMessageDTO {
  message: string;
  conversationId?: string;
  includeEmotionContext?: boolean;
}

export interface ChatMessageResponseDTO {
  success: boolean;
  data?: {
    message: string;
    emotion_detected?: string;
    suggestions?: string[];
    timestamp: Date;
  };
  error?: string;
}

export interface GetChatHistoryDTO {
  conversationId: string;
  page?: number;
  limit?: number;
}

export interface ChatHistoryResponseDTO {
  success: boolean;
  data?: {
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: Date;
      emotion?: string;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    };
  };
  error?: string;
}