/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/calls/[callId]/details/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/mongoose";
import Call from "@/database/call.model";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ callId: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    // ✅ FIX: Await params in Next.js 15
    const { callId } = await context.params;

    console.log("🔍 [GET /api/calls/details] Fetching call:", callId);

    const call = await Call.findById(callId)
      .populate({
        path: "conversation",
        select: "type name avatar participants",
      })
      .populate({
        path: "caller",
        select: "clerkId full_name username avatar",
      });

    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    console.log("✅ [GET /api/calls/details] Call found:", {
      id: call._id,
      channelName: call.channelName,
      status: call.status,
    });

    // ✅ Return call with channelName
    return NextResponse.json({
      id: call._id.toString(),
      channelName: call.channelName,
      channel_name: call.channelName, // ✅ Backup key
      type: call.type,
      status: call.status,
      conversation: {
        id: (call.conversation as any)._id.toString(),
        type: (call.conversation as any).type,
        name: (call.conversation as any).name,
      },
      caller: {
        id: (call.caller as any).clerkId,
        name: (call.caller as any).full_name,
      },
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      duration: call.duration,
    });
  } catch (error: any) {
    console.error("❌ [GET /api/calls/details] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch call" },
      { status: 500 }
    );
  }
}