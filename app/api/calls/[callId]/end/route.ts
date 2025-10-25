/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/calls/[callId]/end/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { endCall } from "@/lib/actions/call.action";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ callId: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { callId } = await context.params;

    if (!callId) {
      return NextResponse.json(
        { error: "Call ID is required" },
        { status: 400 }
      );
    }

    // Get duration from request body (optional)
    const body = await req.json().catch(() => ({}));
    const { duration } = body;

    // Call the action
    const result = await endCall({
      userId,
      callId,
      duration,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("❌ Error in end call API:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to end call",
      },
      { status: 500 }
    );
  }
}
