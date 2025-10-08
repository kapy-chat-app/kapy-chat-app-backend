/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================
// HELPER: Emit Socket Events
// ============================================
export async function emitSocketEvent(
  event: string, 
  conversationId: string, 
  data: any,
  emitToParticipants: boolean = true
) {
  try {
    const socketUrl = process.env.SOCKET_URL || 'http://localhost:3000/api/socket/emit';
    
    await fetch(socketUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        conversationId,
        emitToParticipants,
        data: {
          ...data,
          timestamp: new Date(),
        }
      })
    });
    
    console.log(`✅ Socket event '${event}' emitted (emitToParticipants: ${emitToParticipants})`);
  } catch (socketError) {
    console.error(`⚠️ Socket emit failed for '${event}':`, socketError);
  }
}