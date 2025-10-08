/* eslint-disable @typescript-eslint/no-explicit-any */
import Conversation from "@/database/conversation.model";
import { NextRequest, NextResponse } from "next/server";

// TypeScript declaration cho global
declare global {
  var io: any;
  var onlineUsers: any[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, conversationId, data, userId, roomName, emitToParticipants } = body;

    console.log('📡 Socket emit request:', { event, conversationId, userId, roomName, emitToParticipants });

    if (!event || !data) {
      return NextResponse.json(
        { success: false, error: "Missing event or data" },
        { status: 400 }
      );
    }

    // Lấy io từ global (được set bởi server.js)
    const io = global.io;

    if (!io) {
      console.error("❌ Socket.IO instance not available");
      console.error("💡 Make sure server.js has set global.io");
      return NextResponse.json(
        { success: false, error: "Socket.IO not initialized" },
        { status: 503 }
      );
    }

    // Emit event theo các trường hợp khác nhau
    if (conversationId) {
      // 1. Emit tới conversation room (for MessageScreen)
      const room = `conversation:${conversationId}`;
      io.to(room).emit(event, data);
      console.log(`✅ Emitted '${event}' to conversation room '${room}'`);

      // 2. ✅ Emit tới personal rooms của participants (for ConversationsScreen)
      if (emitToParticipants && data.conversation_id) {
        try {
          
          const conversation = await Conversation.findById(data.conversation_id)
            .populate('participants', 'clerkId')

          if (conversation && conversation.participants) {
            console.log(`📤 Emitting '${event}' to ${conversation.participants.length} participants' personal rooms`);
            
            conversation.participants.forEach((participant: any) => {
              const userRoom = `user:${participant.clerkId}`;
              io.to(userRoom).emit(event, data);
              console.log(`  ✅ Sent to personal room: ${userRoom}`);
            });
          }
        } catch (dbError) {
          console.error('⚠️ Could not fetch conversation participants:', dbError);
          // Continue anyway - at least conversation room got the event
        }
      }
    } else if (userId) {
      // Emit tới user cụ thể
      const onlineUsers = global.onlineUsers || [];
      const targetUser = onlineUsers.find((u: any) => u.userId === userId);
      
      if (targetUser && targetUser.socketId) {
        io.to(targetUser.socketId).emit(event, data);
        console.log(`✅ Emitted '${event}' to user ${userId} (socket: ${targetUser.socketId})`);
      } else {
        console.log(`⚠️ User ${userId} is not online`);
        return NextResponse.json({
          success: false,
          error: "User not online",
          userId
        }, { status: 404 });
      }
    } else if (roomName) {
      // Emit tới room tùy chỉnh
      io.to(roomName).emit(event, data);
      console.log(`✅ Emitted '${event}' to room '${roomName}'`);
    } else {
      // Emit globally (broadcast)
      io.emit(event, data);
      console.log(`✅ Emitted '${event}' globally (broadcast)`);
    }

    return NextResponse.json({ 
      success: true,
      event,
      conversationId,
      userId,
      roomName,
      emitToParticipants,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Socket emit error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to emit socket event" 
      },
      { status: 500 }
    );
  }
}

// GET endpoint để check status
export async function GET() {
  const io = global.io;
  const onlineUsers = global.onlineUsers || [];

  return NextResponse.json({
    socketIOAvailable: !!io,
    onlineUsersCount: onlineUsers.length,
    onlineUsers: onlineUsers.map((u: any) => ({
      userId: u.userId,
      socketId: u.socketId
    })),
    timestamp: new Date().toISOString()
  });
}