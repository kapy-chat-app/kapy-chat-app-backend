/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/socket/emitToParticipants.ts
/**
 * Emit socket events to all participants of a conversation
 * This is used to update ConversationsScreen in real-time
 */
export async function emitToParticipants(
  eventName: string,
  participants: any[],
  data: any
) {
  if (!global.io) {
    console.warn('⚠️ Socket.IO not initialized - skipping emit');
    return;
  }

  console.log(`📤 Emitting ${eventName} to ${participants.length} participants`);

  participants.forEach((participant: any) => {
    const userRoom = `user:${participant.clerkId}`;
    global.io.to(userRoom).emit(eventName, data);
    console.log(`  ✅ Sent to ${userRoom}`);
  });
}

/**
 * Emit to both conversation room and participants
 * Use this for most message events
 */
export async function emitToConversationAndParticipants(
  eventName: string,
  conversationId: string,
  participants: any[],
  data: any
) {
  if (!global.io) {
    console.warn('⚠️ Socket.IO not initialized - skipping emit');
    return;
  }

  // 1. Emit to conversation room (for users in MessageScreen)
  const conversationRoom = `conversation:${conversationId}`;
  global.io.to(conversationRoom).emit(eventName, data);
  console.log(`📤 Emitted ${eventName} to conversation room: ${conversationRoom}`);

  // 2. Emit to all participants' personal rooms (for ConversationsScreen)
  await emitToParticipants(eventName, participants, data);
}