export interface EmotionAnalysisRes {
  id: string;
  user: string;
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
  context: string;
  analyzed_at: Date;
}



export interface EmotionScoresDTO {
  joy: number;
  sadness: number;
  anger: number;
  fear: number;
  surprise: number;
  neutral: number;
}

export interface AudioFeaturesDTO {
  tone: string;
  pitch: number;
  speed: number;
  volume: number;
}

export interface EmotionAnalysisDTO {
  _id: string;
  user: string;
  message?: string;
  conversation?: string;
  emotion_scores: EmotionScoresDTO;
  dominant_emotion: string;
  confidence_score: number;
  text_analyzed?: string;
  audio_features?: AudioFeaturesDTO;
  context: 'message' | 'voice_note' | 'call' | 'general';
  analyzed_at: string;
  created_at: string;
}

export interface EmotionTrendDTO {
  date: string;
  emotion: string;
  count: number;
  avg_confidence: number;
  avg_joy: number;
  avg_sadness: number;
  avg_anger: number;
  avg_fear: number;
}

export interface EmotionStatsDTO {
  total_analyses: number;
  dominant_emotions_count: {
    [key: string]: number;
  };
  average_scores: EmotionScoresDTO;
  trends: EmotionTrendDTO[];
}

export interface GetEmotionHistoryParams {
  limit?: number;
  offset?: number;
  context?: 'message' | 'voice_note' | 'call' | 'general';
  startDate?: string;
  endDate?: string;
}

export interface GetEmotionStatsParams {
  days?: number;
  groupBy?: 'day' | 'week' | 'month';
}