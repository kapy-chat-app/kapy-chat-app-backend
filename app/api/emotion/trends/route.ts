// app/api/emotion/trends/route.ts
import { getEmotionTrends } from '@/lib/actions/emotion.action';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30');
    
    const result = await getEmotionTrends({ userId: '', days });
    
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}