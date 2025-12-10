/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/actions/call-emotion.actions.ts
"use server";

import { connectToDatabase } from "@/lib/mongoose";
import Call from "@/database/call.model";
import EmotionAnalysis from "@/database/emotion-analysis.model";

export async function getCallEmotionSummary(callId: string) {
  try {
    await connectToDatabase();

    const call = await Call.findById(callId);
    if (!call) {
      throw new Error("Call not found");
    }

    // Get all emotions during call timeframe
    const emotions = await EmotionAnalysis.find({
      conversation: call.conversation,
      context: "call",
      analyzed_at: {
        $gte: call.startedAt,
        $lte: call.endedAt || new Date(),
      },
    }).populate("user", "clerkId full_name avatar");

    // Calculate summary
    const emotionCounts: Record<string, number> = {};
    const participantEmotions: Record<string, { emotions: string[]; confidences: number[] }> = {};

    emotions.forEach((emotion) => {
      const userId = (emotion.user as any).clerkId;
      
      // Count emotions
      emotionCounts[emotion.dominant_emotion] = 
        (emotionCounts[emotion.dominant_emotion] || 0) + 1;

      // Track per participant
      if (!participantEmotions[userId]) {
        participantEmotions[userId] = { emotions: [], confidences: [] };
      }
      participantEmotions[userId].emotions.push(emotion.dominant_emotion);
      participantEmotions[userId].confidences.push(emotion.confidence_score);
    });

    const mostCommonEmotion = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";

    const avgConfidence =
      emotions.reduce((sum, e) => sum + e.confidence_score, 0) / emotions.length || 0;

    const participantSummaries = Object.entries(participantEmotions).map(
      ([userId, data]) => {
        const counts: Record<string, number> = {};
        data.emotions.forEach((e) => {
          counts[e] = (counts[e] || 0) + 1;
        });
        const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
        const avgConf =
          data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length;

        return {
          user_id: userId,
          dominant_emotion: dominant,
          avg_confidence: avgConf,
          emotion_distribution: counts,
        };
      }
    );

    return {
      success: true,
      data: {
        total_analyses: emotions.length,
        most_common_emotion: mostCommonEmotion,
        average_confidence: avgConfidence,
        emotion_distribution: emotionCounts,
        participant_summaries: participantSummaries,
        timeline: emotions.map((e) => ({
          user: (e.user as any).clerkId,
          emotion: e.dominant_emotion,
          confidence: e.confidence_score,
          timestamp: e.analyzed_at,
        })),
      },
    };
  } catch (error: any) {
    console.error("❌ Error getting call emotion summary:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}