import { NextRequest, NextResponse } from 'next/server';
import { transferAdmin } from '@/lib/actions/conversation.action';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { newAdminId } = await req.json();

    if (!newAdminId) {
      return NextResponse.json(
        { success: false, error: 'New admin ID is required' },
        { status: 400 }
      );
    }

    const result = await transferAdmin(id, newAdminId);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error in transfer admin API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}