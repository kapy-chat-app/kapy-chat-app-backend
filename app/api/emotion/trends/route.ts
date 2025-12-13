// app/api/emotion/trends/route.ts
import { getEmotionTrends } from '@/lib/actions/emotion.action';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30');
    
<<<<<<< HEAD
    if (days < 1 || days > 365) {
      return NextResponse.json(
        { success: false, error: 'Days must be between 1 and 365' },
        { status: 400 }
      );
    }

=======
>>>>>>> 63e08de234460dc001fd59c4a187160fc0d0d0c1
    const result = await getEmotionTrends({ userId: '', days });
    
    return NextResponse.json(result);
  } catch (error) {
<<<<<<< HEAD
    console.error('Error in /api/emotion/trends:', error);
=======
>>>>>>> 63e08de234460dc001fd59c4a187160fc0d0d0c1
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}