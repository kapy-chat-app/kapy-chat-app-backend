/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/call/analyze-emotion/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/mongoose";
import User from "@/database/user.model";
import Call from "@/database/call.model";
import EmotionAnalysis from "@/database/emotion-analysis.model";
import HuggingFaceService from "@/lib/services/huggingface.service";
import { emitToUserRoom } from "@/lib/socket.helper";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const formData = await req.formData();
    const callId = formData.get("callId") as string;
    const audioBlob = formData.get("audio") as Blob | null;
    const videoBlob = formData.get("video") as Blob | null;
    const timestamp = formData.get("timestamp") as string;

    if (!callId) {
      return NextResponse.json({ error: "Missing callId" }, { status: 400 });
    }

    // Find user
    const mongoUser = await User.findOne({ clerkId: userId });
    if (!mongoUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Find call
    const call = await Call.findById(callId);
    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    console.log(`🎭 [Realtime] Analyzing emotion for user ${userId} in call ${callId}`);

    let emotionResult: any = null;
    let audioFeatures: any = undefined;

    // Convert Blob to Buffer
    const audioBuffer = audioBlob ? Buffer.from(await audioBlob.arrayBuffer()) : null;
    const videoBuffer = videoBlob ? Buffer.from(await videoBlob.arrayBuffer()) : null;

    // Analyze based on available data
    if (audioBuffer && videoBuffer) {
      console.log(`🎭 Analyzing both audio and video...`);
      
      const audioResult = await HuggingFaceService.analyzeAudioEmotion(audioBuffer);
      const videoResult = await HuggingFaceService.analyzeVideoEmotion(videoBuffer);
      
      emotionResult = HuggingFaceService.combineEmotionAnalysis(audioResult, videoResult);
      audioFeatures = audioResult.audioFeatures;
    } else if (audioBuffer) {
      console.log(`🎤 Analyzing audio only...`);
      
      const audioResult = await HuggingFaceService.analyzeAudioEmotion(audioBuffer);
      emotionResult = audioResult;
      audioFeatures = audioResult.audioFeatures;
    } else if (videoBuffer) {
      console.log(`📹 Analyzing video only...`);
      
      emotionResult = await HuggingFaceService.analyzeVideoEmotion(videoBuffer);
    } else {
      return NextResponse.json({ error: "No media provided" }, { status: 400 });
    }

    console.log(`✅ Emotion detected: ${emotionResult.emotion} (${(emotionResult.score * 100).toFixed(0)}%)`);

    // Create EmotionAnalysis record
    const emotionAnalysis = await EmotionAnalysis.create({
      user: mongoUser._id,
      conversation: call.conversation,
      emotion_scores: emotionResult.allScores,
      dominant_emotion: emotionResult.emotion,
      confidence_score: emotionResult.score,
      audio_features: audioFeatures,
      context: "call",
      metadata: {
        analyzed_on: "server",
        analyzed_at: new Date(timestamp || Date.now()),
        call_id: callId,
      },
      analyzed_at: new Date(),
    });

    console.log(`💾 EmotionAnalysis saved: ${emotionAnalysis._id}`);

    // Emit realtime emotion to all participants in call
    const callPopulated = await Call.findById(callId).populate({
      path: "conversation",
      populate: {
        path: "participants",
        select: "clerkId",
      },
    });

    if (callPopulated?.conversation?.participants) {
      const participants = (callPopulated.conversation as any).participants;

      for (const participant of participants) {
        await emitToUserRoom("callEmotionUpdate", participant.clerkId, {
          call_id: callId,
          user_id: userId,
          user_mongo_id: mongoUser._id.toString(),
          emotion: emotionResult.emotion,
          confidence: emotionResult.score,
          emotion_scores: emotionResult.allScores,
          timestamp: new Date().toISOString(),
        });
      }

      console.log(`📡 Emitted emotion to ${participants.length} participants`);
    }

    return NextResponse.json({
      success: true,
      data: {
        emotion: emotionResult.emotion,
        confidence: emotionResult.score,
        emotion_scores: emotionResult.allScores,
        analysis_id: emotionAnalysis._id.toString(),
      },
    });
  } catch (error: any) {
    console.error("❌ Error analyzing call emotion:", error);
    return NextResponse.json(
      { error: error.message || "Failed to analyze emotion" },
      { status: 500 }
    );
  }
}