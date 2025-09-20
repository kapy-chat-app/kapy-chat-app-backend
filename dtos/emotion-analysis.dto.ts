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