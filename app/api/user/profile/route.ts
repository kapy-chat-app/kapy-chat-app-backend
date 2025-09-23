import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCompleteUserProfile } from "@/lib/actions/user.action";

export async function GET() {
  try {
    const { userId } = await auth();
    console.log("clerkId>>>", userId);
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

    const result = await getCompleteUserProfile(userId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Profile API Error:", error);
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
