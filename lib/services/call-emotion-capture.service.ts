/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/call/analyze-emotion-realtime/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { connectToDatabase } from '@/lib/mongoose';
import Call from '@/database/call.model';
import EmotionAnalysis from '@/database/emotion-analysis.model';
import User from '@/database/user.model';
import HuggingFaceService from '@/lib/services/huggingface.service';
import { emitToUserRoom } from '@/lib/socket.helper';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { callId, videoFrameBase64, audioChunkBase64 } = await req.json();

    console.log(`🎬 Realtime emotion analysis request:`, {
      callId,
      hasVideo: !!videoFrameBase64,
      hasAudio: !!audioChunkBase64,
    });

    await connectToDatabase();

    // Find user
    const user = await User.findOne({ clerkId: userId });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find call
    const call = await Call.findById(callId);
    if (!call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    // ⭐ ANALYZE EMOTION
    let emotionResult: any = null;

    // Convert base64 to Buffer
    const videoBuffer = videoFrameBase64 
      ? Buffer.from(videoFrameBase64, 'base64') 
      : null;
    const audioBuffer = audioChunkBase64 
      ? Buffer.from(audioChunkBase64, 'base64') 
      : null;

    if (videoBuffer && audioBuffer) {
      // Both available - combine
      const videoEmotion = await HuggingFaceService.analyzeVideoEmotion(videoBuffer);
      const audioEmotion = await HuggingFaceService.analyzeAudioEmotion(audioBuffer);
      emotionResult = HuggingFaceService.combineEmotionAnalysis(audioEmotion, videoEmotion);
    } else if (videoBuffer) {
      emotionResult = await HuggingFaceService.analyzeVideoEmotion(videoBuffer);
    } else if (audioBuffer) {
      emotionResult = await HuggingFaceService.analyzeAudioEmotion(audioBuffer);
    } else {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 });
    }

    console.log(`✅ Emotion analyzed:`, emotionResult.emotion, emotionResult.score);

    // ⭐ SAVE to Database (với timestamp)
    const emotionAnalysis = await EmotionAnalysis.create({
      user: user._id,
      conversation: call.conversation,
      emotion_scores: emotionResult.allScores,
      dominant_emotion: emotionResult.emotion,
      confidence_score: emotionResult.score,
      context: 'call_realtime',
      metadata: {
        call_id: callId,
        captured_at: new Date(),
        is_realtime: true,
      },
      analyzed_at: new Date(),
    });

    // ⭐ EMIT qua Socket cho tất cả participants
    const conversation = await call.populate('conversation');
    const participants = (conversation as any).conversation.participants;

    for (const participant of participants) {
      await emitToUserRoom('realtimeEmotionUpdate', participant.clerkId, {
        call_id: callId,
        user_id: userId,
        emotion: emotionResult.emotion,
        confidence: emotionResult.score,
        emotion_scores: emotionResult.allScores,
        timestamp: new Date(),
      });
    }

    return NextResponse.json({
      success: true,
      emotion: emotionResult.emotion,
      confidence: emotionResult.score,
      emotion_scores: emotionResult.allScores,
      analysis_id: emotionAnalysis._id.toString(),
    });
  } catch (error: any) {
    console.error('❌ Realtime emotion analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'Analysis failed' },
      { status: 500 }
    );
  }
}