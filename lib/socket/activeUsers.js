// lib/socket/activeUsers.js - ESM version (khuyên dùng)

const INACTIVE_TIMEOUT = 30000; // 30 seconds

// Khởi tạo global map
if (!global.activeUsersMap) {
  global.activeUsersMap = new Map();
}

const activeUsersMap = global.activeUsersMap;

export function setUserActiveInConversation(userId, conversationId, socketId) {
  const key = `${userId}:${conversationId}`;
  activeUsersMap.set(key, {
    userId,
    conversationId,
    socketId,
    lastActivity: Date.now(),
  });
  console.log(`[ACTIVE_USERS] User ${userId} marked as ACTIVE in conversation ${conversationId}`);
}

export function updateUserActivity(userId, conversationId) {
  const key = `${userId}:${conversationId}`;
  const activeUser = activeUsersMap.get(key);
  if (activeUser) {
    activeUser.lastActivity = Date.now();
    activeUsersMap.set(key, activeUser);
  }
}

export function setUserInactiveInConversation(userId, conversationId) {
  const key = `${userId}:${conversationId}`;
  activeUsersMap.delete(key);
  console.log(`[ACTIVE_USERS] User ${userId} marked as INACTIVE in conversation ${conversationId}`);
}

export function isUserActiveInConversation(userId, conversationId) {
  const key = `${userId}:${conversationId}`;
  const activeUser = activeUsersMap.get(key);
  if (!activeUser) return false;

  const timeSinceLastActivity = Date.now() - activeUser.lastActivity;
  if (timeSinceLastActivity > INACTIVE_TIMEOUT) {
    activeUsersMap.delete(key);
    return false;
  }
  return true;
}

export function getActiveUsersInConversation(conversationId) {
  const activeUsers = [];
  const now = Date.now();

  activeUsersMap.forEach((activeUser, key) => {
    if (activeUser.conversationId === conversationId) {
      if (now - activeUser.lastActivity <= INACTIVE_TIMEOUT) {
        activeUsers.push(activeUser.userId);
      } else {
        activeUsersMap.delete(key);
      }
    }
  });

  return activeUsers;
}

export function removeUserFromAllConversations(userId) {
  const keysToDelete = [];
  activeUsersMap.forEach((activeUser, key) => {
    if (activeUser.userId === userId) keysToDelete.push(key);
  });
  keysToDelete.forEach(key => activeUsersMap.delete(key));
  console.log(`User ${userId} removed from all active conversations`);
}

export function cleanupStaleActiveUsers() {
  const now = Date.now();
  const keysToDelete = [];

  activeUsersMap.forEach((activeUser, key) => {
    if (now - activeUser.lastActivity > INACTIVE_TIMEOUT) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => activeUsersMap.delete(key));
  if (keysToDelete.length > 0) {
    console.log(`Cleaned up ${keysToDelete.length} stale active users`);
  }
}

export function getActiveUsersMapSize() {
  return activeUsersMap.size;
}

export function clearAllActiveUsers() {
  activeUsersMap.clear();
  console.log('All active users cleared');
}

// Auto cleanup every minute
setInterval(cleanupStaleActiveUsers, 60000);