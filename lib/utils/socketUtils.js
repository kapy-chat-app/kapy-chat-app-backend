/**
 * Socket utility functions for common operations
 */

/**
 * Find user socket by user ID
 * @param {string} user_id - User ID
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 * @returns {Object|null} Socket instance or null
 */
export function findUserSocket(user_id, io, onlineUsers) {
  const user = onlineUsers.find((u) => u.userId === user_id);
  return user ? io.sockets.sockets.get(user.socketId) : null;
}

/**
 * Emit to multiple users efficiently
 * @param {string[]} user_ids - Array of user IDs
 * @param {string} event - Event name
 * @param {Object} data - Event data
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export function emitToUsers(user_ids, event, data, io, onlineUsers) {
  const onlineUserIds = new Set(onlineUsers.map((u) => u.userId));

  user_ids.forEach((user_id) => {
    if (onlineUserIds.has(user_id)) {
      const socket = findUserSocket(user_id, io, onlineUsers);
      if (socket) {
        socket.emit(event, data);
      }
    }
  });
}

/**
 * Emit to conversation participants
 * @param {string} conversation_id - Conversation ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 * @param {Array} participants - Array of participant IDs
 */
export function emitToConversationParticipants(
  conversation_id,
  event,
  data,
  io,
  onlineUsers,
  participants
) {
  emitToUsers(
    participants,
    event,
    {
      conversation_id,
      ...data,
      timestamp: new Date(),
    },
    io,
    onlineUsers
  );
}

/**
 * Validate required fields
 * @param {Object} data - Data to validate
 * @param {string[]} requiredFields - Array of required field names
 * @throws {Error} If validation fails
 */
export function validateRequiredFields(data, requiredFields) {
  const missingFields = requiredFields.filter((field) => !data[field]);
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
  }
}

/**
 * Validate user ID format
 * @param {string} user_id - User ID to validate
 * @throws {Error} If validation fails
 */
export function validateUserId(user_id) {
  if (!user_id || typeof user_id !== "string" || user_id.trim().length === 0) {
    throw new Error("Invalid user ID");
  }
}

/**
 * Validate conversation ID format
 * @param {string} conversation_id - Conversation ID to validate
 * @throws {Error} If validation fails
 */
export function validateConversationId(conversation_id) {
  if (
    !conversation_id ||
    typeof conversation_id !== "string" ||
    conversation_id.trim().length === 0
  ) {
    throw new Error("Invalid conversation ID");
  }
}

/**
 * Validate message ID format
 * @param {string} message_id - Message ID to validate
 * @throws {Error} If validation fails
 */
export function validateMessageId(message_id) {
  if (
    !message_id ||
    typeof message_id !== "string" ||
    message_id.trim().length === 0
  ) {
    throw new Error("Invalid message ID");
  }
}

/**
 * Create standardized response object
 * @param {boolean} success - Success status
 * @param {Object} data - Response data
 * @param {string} error - Error message (if any)
 * @returns {Object} Standardized response
 */
export function createResponse(success, data = {}, error = null) {
  return {
    success,
    ...data,
    ...(error && { error }),
    timestamp: new Date(),
  };
}

/**
 * Handle socket event with error catching
 * @param {Function} handler - Event handler function
 * @param {string} eventName - Event name for logging
 * @returns {Function} Wrapped handler with error handling
 */
export function withErrorHandling(handler, eventName) {
  return async (data, io, onlineUsers) => {
    try {
      const result = await handler(data, io, onlineUsers);
      return createResponse(true, result);
    } catch (error) {
      console.error(`❌ Error in ${eventName}:`, error);
      return createResponse(false, {}, error.message);
    }
  };
}

/**
 * Rate limiting map to prevent spam
 */
const rateLimitMap = new Map();

/**
 * Check rate limit for user
 * @param {string} user_id - User ID
 * @param {string} action - Action name
 * @param {number} maxRequests - Maximum requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {boolean} Whether request is allowed
 */
export function checkRateLimit(
  user_id,
  action,
  maxRequests = 10,
  windowMs = 60000
) {
  const key = `${user_id}:${action}`;
  const now = Date.now();

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  const limit = rateLimitMap.get(key);

  if (now > limit.resetTime) {
    limit.count = 1;
    limit.resetTime = now + windowMs;
    return true;
  }

  if (limit.count >= maxRequests) {
    return false;
  }

  limit.count++;
  return true;
}

/**
 * Clean up expired rate limit entries
 */
export function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, limit] of rateLimitMap.entries()) {
    if (now > limit.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}

// Clean up rate limit every 5 minutes
setInterval(cleanupRateLimit, 5 * 60 * 1000);

/**
 * Batch emit events to reduce network overhead
 * @param {Array} events - Array of {user_id, event, data} objects
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export function batchEmitEvents(events, io, onlineUsers) {
  const userEvents = new Map();

  // Group events by user
  events.forEach(({ user_id, event, data }) => {
    if (!userEvents.has(user_id)) {
      userEvents.set(user_id, []);
    }
    userEvents.get(user_id).push({ event, data });
  });

  // Emit batched events
  userEvents.forEach((userEventList, user_id) => {
    const socket = findUserSocket(user_id, io, onlineUsers);
    if (socket) {
      socket.emit("batchedEvents", {
        events: userEventList,
        timestamp: new Date(),
      });
    }
  });
}

/**
 * Validate message content
 * @param {string} content - Message content
 * @param {string} type - Message type
 * @returns {boolean} Whether content is valid
 */
export function validateMessageContent(content, type) {
  if (type === "text") {
    return content && content.trim().length > 0 && content.length <= 10000;
  }
  return true; // For non-text messages, content validation is handled elsewhere
}

/**
 * Sanitize user input
 * @param {string} input - User input
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input) {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, 1000); // Limit length and trim whitespace
}

/**
 * Check if user is online
 * @param {string} user_id - User ID
 * @param {Array} onlineUsers - Array of online users
 * @returns {boolean} Whether user is online
 */
export function isUserOnline(user_id, onlineUsers) {
  return onlineUsers.some((user) => user.userId === user_id);
}

/**
 * Get online user count
 * @param {Array} onlineUsers - Array of online users
 * @returns {number} Number of online users
 */
export function getOnlineUserCount(onlineUsers) {
  return onlineUsers.length;
}

/**
 * Create notification data structure
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} content - Notification content
 * @param {Object} data - Additional data
 * @returns {Object} Notification data structure
 */
export function createNotificationData(type, title, content, data = {}) {
  return {
    type,
    title: sanitizeInput(title),
    content: sanitizeInput(content),
    data,
    deliveryMethod: "in_app",
  };
}
