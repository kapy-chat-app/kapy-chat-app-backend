/* eslint-disable @typescript-eslint/no-explicit-any */
export function emitSocketEvent(event: string, conversationId: string, data: any) {
  try {
    const io = (global as any).io;
    
    if (!io) {
      console.error("❌ Socket.IO not available in helper");
      return false;
    }

    const roomName = `conversation:${conversationId}`;
    io.to(roomName).emit(event, data);
    console.log(`✅ Emitted ${event} to ${roomName}`);
    return true;
  } catch (error) {
    console.error("❌ Socket emit error:", error);
    return false;
  }
}