/**
 * Base Event Handler - Tối ưu hóa logic chung cho tất cả socket events
 */

import {
  checkRateLimit,
  createResponse,
  emitToConversationParticipants,
  emitToUsers,
  findUserSocket,
  sanitizeInput,
  validateConversationId,
  validateMessageId,
  validateRequiredFields,
  validateUserId,
} from "../utils/socketUtils.js";

import {
  getConversationWithParticipants,
  invalidateCache,
} from "../utils/dbUtils.js";

/**
 * Base Event Handler Class
 */
export class BaseEventHandler {
  constructor() {
    this.rateLimits = new Map();
    this.cache = new Map();
  }

  /**
   * Tạo event handler với validation, rate limiting và error handling
   * @param {Object} config - Configuration object
   * @param {string[]} config.requiredFields - Required fields for validation
   * @param {string} config.rateLimitAction - Rate limit action name
   * @param {number} config.maxRequests - Max requests per window
   * @param {number} config.windowMs - Time window in milliseconds
   * @param {Function} config.handler - Main handler function
   * @param {boolean} config.requireAuth - Whether authentication is required
   * @returns {Function} Optimized event handler
   */
  createHandler(config) {
    const {
      requiredFields = [],
      rateLimitAction,
      maxRequests = 10,
      windowMs = 60000,
      handler,
      requireAuth = true,
    } = config;

    return async (data, io, onlineUsers) => {
      try {
        // 1. Authentication check
        if (requireAuth && !data.user_id) {
          throw new Error("Authentication required");
        }

        // 2. Rate limiting
        if (rateLimitAction && data.user_id) {
          if (
            !checkRateLimit(
              data.user_id,
              rateLimitAction,
              maxRequests,
              windowMs
            )
          ) {
            throw new Error(`Rate limit exceeded for ${rateLimitAction}`);
          }
        }

        // 3. Validation
        if (requiredFields.length > 0) {
          validateRequiredFields(data, requiredFields);
        }

        // 4. Common validations
        if (data.user_id) validateUserId(data.user_id);
        if (data.conversation_id) validateConversationId(data.conversation_id);
        if (data.message_id) validateMessageId(data.message_id);

        // 5. Execute main handler
        const result = await handler.call(this, data, io, onlineUsers);

        // 6. Return standardized response
        return createResponse(true, result);
      } catch (error) {
        console.error(`❌ Error in ${rateLimitAction || "event"}:`, error);
        return createResponse(false, {}, error.message);
      }
    };
  }

  /**
   * Emit to conversation participants (optimized)
   * @param {string} conversation_id - Conversation ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @param {Object} io - Socket.IO instance
   * @param {Array} onlineUsers - Array of online users
   * @param {Array} excludeUsers - Users to exclude from emission
   */
  async emitToConversation(
    conversation_id,
    event,
    data,
    io,
    onlineUsers,
    excludeUsers = []
  ) {
    try {
      const conversation = await getConversationWithParticipants(
        conversation_id
      );
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const participants = conversation.participants
        .map((p) => p._id.toString())
        .filter((id) => !excludeUsers.includes(id));

      emitToConversationParticipants(
        conversation_id,
        event,
        data,
        io,
        onlineUsers,
        participants
      );

      return participants;
    } catch (error) {
      console.error("Error emitting to conversation:", error);
      return [];
    }
  }

  /**
   * Emit to specific users
   * @param {string[]} user_ids - Array of user IDs
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @param {Object} io - Socket.IO instance
   * @param {Array} onlineUsers - Array of online users
   */
  emitToUsers(user_ids, event, data, io, onlineUsers) {
    emitToUsers(user_ids, event, data, io, onlineUsers);
  }

  /**
   * Emit to single user
   * @param {string} user_id - User ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @param {Object} io - Socket.IO instance
   * @param {Array} onlineUsers - Array of online users
   */
  emitToUser(user_id, event, data, io, onlineUsers) {
    const socket = findUserSocket(user_id, io, onlineUsers);
    if (socket) {
      socket.emit(event, {
        ...data,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get conversation participants (cached)
   * @param {string} conversation_id - Conversation ID
   * @returns {Promise<Array>} Array of participant IDs
   */
  async getConversationParticipants(conversation_id) {
    try {
      const conversation = await getConversationWithParticipants(
        conversation_id
      );
      return conversation
        ? conversation.participants.map((p) => p._id.toString())
        : [];
    } catch (error) {
      console.error("Error getting conversation participants:", error);
      return [];
    }
  }

  /**
   * Check if user is online
   * @param {string} user_id - User ID
   * @param {Array} onlineUsers - Array of online users
   * @returns {boolean} Whether user is online
   */
  isUserOnline(user_id, onlineUsers) {
    return onlineUsers.some((user) => user.userId === user_id);
  }

  /**
   * Get online users from participant list
   * @param {string[]} participant_ids - Array of participant IDs
   * @param {Array} onlineUsers - Array of online users
   * @returns {Object} Object with online and offline user arrays
   */
  categorizeUsersByStatus(participant_ids, onlineUsers) {
    const onlineUserIds = new Set(onlineUsers.map((u) => u.userId));

    return {
      online: participant_ids.filter((id) => onlineUserIds.has(id)),
      offline: participant_ids.filter((id) => !onlineUserIds.has(id)),
    };
  }

  /**
   * Invalidate related caches
   * @param {string} pattern - Cache pattern to invalidate
   */
  invalidateCache(pattern) {
    invalidateCache(pattern);
  }

  /**
   * Sanitize input data
   * @param {any} data - Data to sanitize
   * @returns {any} Sanitized data
   */
  sanitizeData(data) {
    if (typeof data === "string") {
      return sanitizeInput(data);
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeData(item));
    }

    if (data && typeof data === "object") {
      const sanitized = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = this.sanitizeData(value);
      }
      return sanitized;
    }

    return data;
  }

  /**
   * Create notification data structure
   * @param {string} type - Notification type
   * @param {string} title - Notification title
   * @param {string} content - Notification content
   * @param {Object} data - Additional data
   * @returns {Object} Notification data structure
   */
  createNotificationData(type, title, content, data = {}) {
    return {
      type,
      title: sanitizeInput(title),
      content: sanitizeInput(content),
      data: this.sanitizeData(data),
      deliveryMethod: "in_app",
    };
  }

  /**
   * Batch database operations
   * @param {Array} operations - Array of database operations
   * @returns {Promise<Array>} Results of all operations
   */
  async batchOperations(operations) {
    try {
      return await Promise.all(operations);
    } catch (error) {
      console.error("Error in batch operations:", error);
      throw error;
    }
  }

  /**
   * Log event with context
   * @param {string} event - Event name
   * @param {string} user_id - User ID
   * @param {Object} context - Additional context
   */
  logEvent(event, user_id, context = {}) {
    console.log(`📝 ${event} by ${user_id}`, context);
  }

  /**
   * Get user socket
   * @param {string} user_id - User ID
   * @param {Object} io - Socket.IO instance
   * @param {Array} onlineUsers - Array of online users
   * @returns {Object|null} Socket instance or null
   */
  getUserSocket(user_id, io, onlineUsers) {
    return findUserSocket(user_id, io, onlineUsers);
  }
}

/**
 * Event Handler Factory
 */
export class EventHandlerFactory {
  constructor() {
    this.baseHandler = new BaseEventHandler();
    this.handlers = new Map();
  }

  /**
   * Register event handler
   * @param {string} eventName - Event name
   * @param {Object} config - Handler configuration
   */
  register(eventName, config) {
    const handler = this.baseHandler.createHandler(config);
    this.handlers.set(eventName, handler);
    return handler;
  }

  /**
   * Get event handler
   * @param {string} eventName - Event name
   * @returns {Function|null} Event handler or null
   */
  get(eventName) {
    return this.handlers.get(eventName) || null;
  }

  /**
   * Get all registered handlers
   * @returns {Map} Map of all handlers
   */
  getAll() {
    return this.handlers;
  }

  /**
   * Create message event handler
   * @param {Function} handler - Main handler function
   * @param {Object} options - Additional options
   * @returns {Function} Optimized message handler
   */
  createMessageHandler(handler, options = {}) {
    return this.register("message", {
      requiredFields: ["sender_id", "conversation_id", "message_type"],
      rateLimitAction: "send_message",
      maxRequests: 30,
      windowMs: 60000,
      handler,
      ...options,
    });
  }

  /**
   * Create call event handler
   * @param {Function} handler - Main handler function
   * @param {Object} options - Additional options
   * @returns {Function} Optimized call handler
   */
  createCallHandler(handler, options = {}) {
    return this.register("call", {
      requiredFields: ["caller_id", "recipient_id", "conversation_id"],
      rateLimitAction: "start_call",
      maxRequests: 5,
      windowMs: 60000,
      handler,
      ...options,
    });
  }

  /**
   * Create friend event handler
   * @param {Function} handler - Main handler function
   * @param {Object} options - Additional options
   * @returns {Function} Optimized friend handler
   */
  createFriendHandler(handler, options = {}) {
    return this.register("friend", {
      requiredFields: ["requester_id", "recipient_id"],
      rateLimitAction: "friend_request",
      maxRequests: 5,
      windowMs: 60000,
      handler,
      ...options,
    });
  }

  /**
   * Create conversation event handler
   * @param {Function} handler - Main handler function
   * @param {Object} options - Additional options
   * @returns {Function} Optimized conversation handler
   */
  createConversationHandler(handler, options = {}) {
    return this.register("conversation", {
      requiredFields: ["user_id", "conversation_id"],
      rateLimitAction: "conversation_action",
      maxRequests: 10,
      windowMs: 60000,
      handler,
      ...options,
    });
  }

  /**
   * Create read event handler
   * @param {Function} handler - Main handler function
   * @param {Object} options - Additional options
   * @returns {Function} Optimized read handler
   */
  createReadHandler(handler, options = {}) {
    return this.register("read", {
      requiredFields: ["user_id", "message_id"],
      rateLimitAction: "mark_read",
      maxRequests: 20,
      windowMs: 60000,
      handler,
      ...options,
    });
  }

  /**
   * Create reaction event handler
   * @param {Function} handler - Main handler function
   * @param {Object} options - Additional options
   * @returns {Function} Optimized reaction handler
   */
  createReactionHandler(handler, options = {}) {
    return this.register("reaction", {
      requiredFields: ["user_id", "message_id", "reaction"],
      rateLimitAction: "add_reaction",
      maxRequests: 20,
      windowMs: 60000,
      handler,
      ...options,
    });
  }
}

// Export singleton instance
export const eventHandlerFactory = new EventHandlerFactory();
export const baseEventHandler = new BaseEventHandler();
