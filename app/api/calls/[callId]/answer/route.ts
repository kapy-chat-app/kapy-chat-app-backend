/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/calls/[callId]/answer/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/mongoose";
import Call from "@/database/call.model";
import Conversation from "@/database/conversation.model";
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

    // Check if call is still ringing
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
    call.status = "ongoing";

    // ⭐ Kiểm tra xem user đã có trong participants chưa
    const userAlreadyInCall = call.participants.some(
      (p: any) => p.user.toString() === mongoUser._id.toString()
    );

    if (!userAlreadyInCall) {
      call.participants.push({
        user: mongoUser._id,
        joinedAt: new Date(),
      });
    }

    await call.save();

    console.log(`📞 Call answered: ${call._id} by ${userId} (MongoDB: ${mongoUser._id})`);

    // ⭐ Prepare call answered data
    const callAnsweredData = {
      call_id: call._id.toString(),
      answered_by: userId,
      answered_by_name: clerkUser.firstName + " " + clerkUser.lastName,
      answered_by_avatar: clerkUser.imageUrl,
      channel_name: call.channelName,
      status: call.status,
    };

    // ⭐ Emit callAnswered đến PERSONAL ROOM của TẤT CẢ participants
    const conversation = call.conversation as any;
    if (conversation && conversation.participants) {
      console.log(`📤 Emitting callAnswered to ${conversation.participants.length} participants`);
      
      for (const participant of conversation.participants) {
        console.log(`📞 Sending callAnswered to user: ${participant.clerkId}`);
        await emitToUserRoom("callAnswered", participant.clerkId, callAnsweredData);
      }
    }

    console.log(`✅ Call answered notification sent to all participants`);

    return NextResponse.json({
      success: true,
      channelName: call.channelName,
      callId: call._id.toString(),
      status: call.status,
    });
  } catch (error: any) {
    console.error("❌ Error answering call:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to answer call",
      },
      { status: 500 }
    );
  }
}