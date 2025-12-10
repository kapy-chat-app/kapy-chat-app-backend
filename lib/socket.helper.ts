/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================
// HELPER: Emit Socket Events
// ============================================

// Emit đến conversation room (GIỮ NGUYÊN)
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

// ⭐ NEW: Emit đến personal room của user (CHỈ CHO INCOMING CALL)
export async function emitToUserRoom(
  event: string,
  userId: string,
  data: any
) {
  try {
    const socketUrl = process.env.SOCKET_URL || 'http://localhost:3000/api/socket/emit';
    
    await fetch(socketUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        roomName: `user:${userId}`, // ⭐ Sử dụng roomName với format user:clerkId
        data: {
          ...data,
          timestamp: new Date(),
        }
      })
    });
    
    console.log(`✅ Socket event '${event}' emitted to user room: user:${userId}`);
  } catch (socketError) {
    console.error(`⚠️ Socket emit failed for '${event}' to user ${userId}:`, socketError);
  }
}


/**
 * Check if user is currently active in a conversation
 * Used to decide whether to send push notifications
 */
export async function checkUserActiveInConversation(
  userId: string,
  conversationId: string
): Promise<boolean> {
  try {
    console.log(`🔍 [CHECK_ACTIVE] Checking active status for user ${userId} in conversation ${conversationId}`);

    // ✅ Tạo AbortController thủ công (tương thích Node.js cũ)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch('http://localhost:3000/api/socket/check-active', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          userId, 
          conversationId 
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`⚠️ [CHECK_ACTIVE] API returned status ${response.status}`);
        return false;
      }

      const result = await response.json();
      const isActive = result.isActive || false;

      console.log(`✅ [CHECK_ACTIVE] User ${userId} active status: ${isActive}`);
      
      return isActive;

    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }

  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error('⏰ [CHECK_ACTIVE] Request timeout (3s) - assuming user is NOT active');
      } else {
        console.error('❌ [CHECK_ACTIVE] Error:', error.message);
      }
    } else {
      console.error('❌ [CHECK_ACTIVE] Unknown error:', error);
    }
    return false;
  }
}