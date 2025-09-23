/* eslint-disable @typescript-eslint/no-explicit-any */
import { ProfileUpdateDTO } from "@/dtos/user.dto";
import { updateCompleteUserProfile } from "@/lib/actions/user.action";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
          profileComplete: false,
        },
        { status: 401 }
      );
    }

    const updateData: ProfileUpdateDTO = await request.json();

    if (updateData.username && updateData.username.length < 3) {
      return NextResponse.json(
        {
          success: false,
          error: "Username must be at least 3 characters",
          profileComplete: false,
        },
        { status: 400 }
      );
    }

    const result = await updateCompleteUserProfile(userId, updateData);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Profile update API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        profileComplete: false,
      },
      { status: 500 }
    );
  }
}
