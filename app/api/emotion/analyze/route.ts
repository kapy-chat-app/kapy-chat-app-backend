// app/api/emotion/analyze/route.ts
import { analyzeMessageEmotion } from '@/lib/actions/emotion.action';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await analyzeMessageEmotion(body);
    
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
