import { NextRequest, NextResponse } from 'next/server';
import { updateGroupAvatar } from '@/lib/actions/conversation.action';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const formData = await req.formData();
    const avatarFile = formData.get('avatar') as File;

    if (!avatarFile) {
      return NextResponse.json(
        { success: false, error: 'Avatar file is required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!avatarFile.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: 'Only image files are allowed for avatar' },
        { status: 400 }
      );
    }

    // Validate file size (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (avatarFile.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'Avatar file size must be less than 5MB' },
        { status: 400 }
      );
    }

    const result = await updateGroupAvatar(id, avatarFile);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error in update avatar API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}