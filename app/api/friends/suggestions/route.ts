import { getFriendSuggestions } from "@/lib/actions/friend.action";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const {userId: clerkId} = await auth();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");

    const suggestions = await getFriendSuggestions(clerkId!,limit);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Get friend suggestions API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
