// app/api/emotion/save/route.ts
import { saveEmotionAnalysis } from '@/lib/actions/emotion.action';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate required fields
    const { 
      textAnalyzed, 
      emotionScores, 
      dominantEmotion, 
      confidenceScore, 
      context 
    } = body;

    if (!textAnalyzed || !emotionScores || !dominantEmotion || confidenceScore === undefined || !context) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await saveEmotionAnalysis(body);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in /api/emotion/save:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}