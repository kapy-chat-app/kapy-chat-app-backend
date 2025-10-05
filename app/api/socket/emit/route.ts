/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";

// TypeScript declaration cho global
declare global {
  var io: any;
  var onlineUsers: any[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, conversationId, data, userId, roomName } = body;

    console.log('📡 Socket emit request:', { event, conversationId, userId, roomName });

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
      // Emit tới conversation room
      const room = `conversation:${conversationId}`;
      io.to(room).emit(event, data);
      console.log(`✅ Emitted '${event}' to room '${room}'`);
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