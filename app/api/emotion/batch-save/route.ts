// app/api/emotion/batch-save/route.ts
import { batchSaveEmotionAnalysis } from '@/lib/actions/emotion.action';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate required fields
    const { 
      participantIds, 
      conversationId,
      textAnalyzed, 
      emotionScores, 
      dominantEmotion, 
      confidenceScore, 
      context 
    } = body;

    if (!participantIds || !conversationId || !textAnalyzed || !emotionScores || 
        !dominantEmotion || confidenceScore === undefined || !context) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'participantIds must be a non-empty array' },
        { status: 400 }
      );
    }

    const result = await batchSaveEmotionAnalysis(body);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in /api/emotion/batch-save:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}