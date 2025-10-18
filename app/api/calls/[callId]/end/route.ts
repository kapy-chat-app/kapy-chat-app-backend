/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/calls/[callId]/end/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/mongoose";
import Call from "@/database/call.model";
import User from "@/database/user.model";
import { emitToUserRoom } from "@/lib/socket.helper"; // ⭐ Import function mới

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

    await connectToDatabase();

    // ⭐ Tìm MongoDB User từ clerkId
    const mongoUser = await User.findOne({ clerkId: userId });
    if (!mongoUser) {
      return NextResponse.json(
        { error: "User not found in database" },
        { status: 404 }
      );
    }

    // Find call và populate conversation
    const call = await Call.findById(callId).populate({
      path: 'conversation',
      populate: {
        path: 'participants',
        select: 'clerkId full_name avatar _id'
      }
    });

    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    // Check if call is already ended
    if (call.status === "ended") {
      return NextResponse.json(
        {
          success: true,
          message: "Call already ended",
          duration: call.duration || 0,
        },
        { status: 200 }
      );
    }

    // Get user info from Clerk
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);

    // Calculate duration if not provided
    let callDuration = duration;
    if (!callDuration && call.startedAt) {
      const endTime = new Date();
      const startTime = new Date(call.startedAt);
      callDuration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
    }

    // ⭐ Update call status
    call.status = "ended";
    call.endedAt = new Date();
    call.endedBy = mongoUser._id;
    if (callDuration) {
      call.duration = callDuration;
    }
    await call.save();

    console.log(`📞 Call ended: ${call._id} by ${userId} (MongoDB: ${mongoUser._id}), duration: ${callDuration}s`);

    // ⭐ Prepare call ended data
    const callEndedData = {
      call_id: call._id.toString(),
      ended_by: userId,
      ended_by_name: clerkUser.firstName + " " + clerkUser.lastName,
      ended_by_avatar: clerkUser.imageUrl,
      duration: callDuration || 0,
      status: "ended",
    };

    // ⭐ Emit callEnded đến PERSONAL ROOM của TẤT CẢ participants
    const conversation = call.conversation as any;
    if (conversation && conversation.participants) {
      console.log(`📤 Emitting callEnded to ${conversation.participants.length} participants`);
      
      for (const participant of conversation.participants) {
        console.log(`📞 Sending callEnded to user: ${participant.clerkId}`);
        await emitToUserRoom("callEnded", participant.clerkId, callEndedData);
      }
    }

    console.log(`✅ Call ended notification sent to all participants`);

    return NextResponse.json({
      success: true,
      duration: call.duration || 0,
      status: "ended",
      callId: call._id.toString(),
    });
  } catch (error: any) {
    console.error("❌ Error ending call:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to end call",
      },
      { status: 500 }
    );
  }
}