/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/calls/[callId]/answer/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { answerCall } from "@/lib/actions/call.action";

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

    // Call the action
    const result = await answerCall({
      userId,
      callId,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("❌ Error in answer call API:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to answer call",
      },
      { status: 400 }
    );
  }
}
