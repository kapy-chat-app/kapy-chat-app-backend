// app/api/emotion/recent/route.ts
import { getRecentEmotions } from '@/lib/actions/emotion.action';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '20');
    
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { success: false, error: 'Limit must be between 1 and 100' },
        { status: 400 }
      );
    }

    const result = await getRecentEmotions(limit);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in /api/emotion/recent:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}