import { NextRequest, NextResponse } from 'next/server';
import { addParticipants } from '@/lib/actions/conversation.action';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { participantIds } = await req.json();

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Participant IDs array is required' },
        { status: 400 }
      );
    }

    const result = await addParticipants(id, participantIds);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error in add participants API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
