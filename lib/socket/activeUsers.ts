// lib/socket/activeUsers.ts

const INACTIVITY_TIMEOUT = 30000; // 30 seconds
const CLEANUP_INTERVAL = 60000; // 1 minute

// ✅ Global Map để share state giữa socket-server.js và API routes
if (!global.activeUsersMap) {
  global.activeUsersMap = new Map<string, { lastActivity: number; socketId: string }>();
}

function getKey(userId: string, conversationId: string): string {
  return `${userId}:${conversationId}`;
}

export function setUserActiveInConversation(
  userId: string,
  conversationId: string,
  socketId: string
): void {
  const key = getKey(userId, conversationId);
  global.activeUsersMap.set(key, {
    lastActivity: Date.now(),
    socketId,
  });
  console.log(`[ACTIVE_USERS] ✅ User ${userId} marked as ACTIVE in ${conversationId}`);
}

export function setUserInactiveInConversation(
  userId: string,
  conversationId: string
): void {
  const key = getKey(userId, conversationId);
  global.activeUsersMap.delete(key);
  console.log(`[ACTIVE_USERS] 👋 User ${userId} marked as INACTIVE in ${conversationId}`);
}

export function updateUserActivity(
  userId: string,
  conversationId: string
): void {
  const key = getKey(userId, conversationId);
  const entry = global.activeUsersMap.get(key);
  if (entry) {
    entry.lastActivity = Date.now();
    console.log(`[ACTIVE_USERS] 🔄 Activity updated for ${userId}`);
  }
}

export function isUserActiveInConversation(
  userId: string,
  conversationId: string
): boolean {
  const key = getKey(userId, conversationId);
  const entry = global.activeUsersMap.get(key);

  if (!entry) {
    console.log(`[ACTIVE_USERS] ❌ User ${userId} NOT found in ${conversationId}`);
    return false;
  }

  const now = Date.now();
  const timeSinceActivity = now - entry.lastActivity;
  const isActive = timeSinceActivity < INACTIVITY_TIMEOUT;

  console.log(`[ACTIVE_USERS] ${isActive ? '✅' : '❌'} User ${userId} in ${conversationId}: ${isActive ? 'ACTIVE' : 'INACTIVE'} (${timeSinceActivity}ms ago)`);

  return isActive;
}

export function removeUserFromAllConversations(userId: string): void {
  let removedCount = 0;
  for (const key of global.activeUsersMap.keys()) {
    if (key.startsWith(`${userId}:`)) {
      global.activeUsersMap.delete(key);
      removedCount++;
    }
  }
  if (removedCount > 0) {
    console.log(`[ACTIVE_USERS] 🧹 Removed user ${userId} from ${removedCount} conversations`);
  }
}

// Cleanup stale entries periodically
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [key, entry] of global.activeUsersMap.entries()) {
    if (now - entry.lastActivity > INACTIVITY_TIMEOUT) {
      global.activeUsersMap.delete(key);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`[ACTIVE_USERS] 🧹 Cleaned up ${cleanedCount} stale entries`);
  }
}, CLEANUP_INTERVAL);