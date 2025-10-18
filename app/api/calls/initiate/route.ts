/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/calls/initiate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/mongoose";
import Call from "@/database/call.model";
import Conversation from "@/database/conversation.model";
import User from "@/database/user.model";
import { emitToUserRoom } from "@/lib/socket.helper"; // ⭐ Import function mới

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId, type } = await req.json();

    if (!conversationId || !type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const callerUser = await User.findOne({ clerkId: userId });
    
    if (!callerUser) {
      return NextResponse.json(
        { error: "User not found in database" },
        { status: 404 }
      );
    }

    const conversation = await Conversation.findById(conversationId).populate(
      "participants",
      "clerkId full_name avatar _id"
    );

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const clerk = await clerkClient();
    const caller = await clerk.users.getUser(userId);

    const channelName = `call_${conversationId}_${Date.now()}`;

    const participants = conversation.participants.map((p: any) => ({
      user: p._id,
      joinedAt: new Date(),
    }));

    if (conversation.type === 'private' && participants.length !== 2) {
      return NextResponse.json(
        { error: "Personal calls must have exactly 2 participants" },
        { status: 400 }
      );
    }

    const call = await Call.create({
      conversation: conversationId,
      caller: callerUser._id,
      type,
      channelName,
      status: "ringing",
      startedAt: new Date(),
      participants: participants,
    });

    console.log(`📞 Call initiated: ${call._id} by ${callerUser._id}`);
    console.log(`👥 Total participants:`, participants.length);

    // ⭐ Lọc ra những người KHÔNG PHẢI caller
    const otherParticipants = conversation.participants.filter(
      (p: any) => p.clerkId !== userId
    );

    console.log(`📤 Sending incoming call to ${otherParticipants.length} participants (excluding caller)`);
    console.log(`📋 Other participants:`, otherParticipants.map((p: any) => p.clerkId));

    // ⭐ Prepare call data
    const callData = {
      call_id: call._id.toString(),
      caller_id: userId,
      caller_name: caller.firstName + " " + caller.lastName,
      caller_avatar: caller.imageUrl,
      call_type: type,
      conversation_id: conversationId,
      channel_name: channelName,
    };

    // ⭐ Gửi incoming call đến từng user riêng lẻ (QUA PERSONAL ROOM)
    for (const participant of otherParticipants) {
      console.log(`📞 Emitting incomingCall to user room: user:${participant.clerkId}`);
      await emitToUserRoom("incomingCall", participant.clerkId, callData);
    }

    console.log(`✅ Incoming call sent to ${otherParticipants.length} participants`);

    return NextResponse.json({
      success: true,
      call: {
        id: call._id.toString(),
        channelName,
        type,
        status: call.status,
        conversationId,
      },
      caller: {
        id: userId,
        name: caller.firstName + " " + caller.lastName,
        avatar: caller.imageUrl,
      },
    });
  } catch (error: any) {
    console.error("❌ Error initiating call:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to initiate call",
      },
      { status: 500 }
    );
  }
}