/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/calls/[callId]/reject/route.ts
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

    // Check if call can be rejected
    if (call.status !== "ringing") {
      return NextResponse.json(
        { error: `Call is already ${call.status}` },
        { status: 400 }
      );
    }

    // Get user info from Clerk
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);

    // ⭐ Update call status
    call.status = "rejected";
    call.endedAt = new Date();
    call.endedBy = mongoUser._id;
    await call.save();

    console.log(`📞 Call rejected: ${call._id} by ${userId} (MongoDB: ${mongoUser._id})`);

    // ⭐ Prepare call rejected data
    const callRejectedData = {
      call_id: call._id.toString(),
      rejected_by: userId,
      rejected_by_name: clerkUser.firstName + " " + clerkUser.lastName,
      rejected_by_avatar: clerkUser.imageUrl,
      status: "rejected",
    };

    // ⭐ Emit callRejected đến PERSONAL ROOM của TẤT CẢ participants
    const conversation = call.conversation as any;
    if (conversation && conversation.participants) {
      console.log(`📤 Emitting callRejected to ${conversation.participants.length} participants`);
      
      for (const participant of conversation.participants) {
        console.log(`📞 Sending callRejected to user: ${participant.clerkId}`);
        await emitToUserRoom("callRejected", participant.clerkId, callRejectedData);
      }
    }

    console.log(`✅ Call rejected notification sent to all participants`);

    return NextResponse.json({
      success: true,
      status: "rejected",
      callId: call._id.toString(),
    });
  } catch (error: any) {
    console.error("❌ Error rejecting call:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to reject call",
      },
      { status: 500 }
    );
  }
}