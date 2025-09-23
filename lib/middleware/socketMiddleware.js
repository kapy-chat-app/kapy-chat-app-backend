/**
 * Socket middleware for authentication, rate limiting, and optimization
 */

import { checkRateLimit, sanitizeInput } from "../utils/socketUtils.js";

/**
 * Authentication middleware for socket connections
 * @param {Object} socket - Socket instance
 * @param {Function} next - Next middleware function
 */
export function authenticateSocket(socket, next) {
  try {
    const token =
      socket.handshake.auth.token || socket.handshake.headers.authorization;

    if (!token) {
      return next(new Error("Authentication token required"));
    }

    // TODO: Implement JWT token validation
    // For now, we'll extract user info from token
    const user = extractUserFromToken(token);

    if (!user) {
      return next(new Error("Invalid authentication token"));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error("Authentication failed"));
  }
}

/**
 * Rate limiting middleware
 * @param {string} action - Action name for rate limiting
 * @param {number} maxRequests - Maximum requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Middleware function
 */
export function rateLimitSocket(action, maxRequests = 10, windowMs = 60000) {
  return (socket, next) => {
    const user_id = socket.user?.id;

    if (!user_id) {
      return next(new Error("User not authenticated"));
    }

    if (!checkRateLimit(user_id, action, maxRequests, windowMs)) {
      return next(new Error(`Rate limit exceeded for ${action}`));
    }

    next();
  };
}

/**
 * Input sanitization middleware
 * @param {Object} socket - Socket instance
 * @param {Function} next - Next middleware function
 */
export function sanitizeSocketInput(socket, next) {
  // Sanitize all incoming data
  const originalEmit = socket.emit;
  socket.emit = function (event, data) {
    if (data && typeof data === "object") {
      data = sanitizeSocketData(data);
    }
    return originalEmit.call(this, event, data);
  };

  next();
}

/**
 * Connection logging middleware
 * @param {Object} socket - Socket instance
 * @param {Function} next - Next middleware function
 */
export function logSocketConnection(socket, next) {
  const userAgent = socket.handshake.headers["user-agent"];
  const ip = socket.handshake.address;

  console.log(`🔌 New socket connection from ${ip} (${userAgent})`);

  socket.on("disconnect", (reason) => {
    console.log(`🔌 Socket disconnected: ${reason}`);
  });

  next();
}

/**
 * Performance monitoring middleware
 * @param {Object} socket - Socket instance
 * @param {Function} next - Next middleware function
 */
export function monitorSocketPerformance(socket, next) {
  const startTime = Date.now();
  let eventCount = 0;

  socket.onAny((eventName, ...args) => {
    eventCount++;
    const eventTime = Date.now();

    // Log slow events (> 1 second)
    if (eventTime - startTime > 1000) {
      console.warn(
        `⚠️ Slow socket event: ${eventName} took ${eventTime - startTime}ms`
      );
    }
  });

  // Log performance stats on disconnect
  socket.on("disconnect", () => {
    const totalTime = Date.now() - startTime;
    console.log(
      `📊 Socket performance: ${eventCount} events in ${totalTime}ms`
    );
  });

  next();
}

/**
 * Error handling middleware
 * @param {Object} socket - Socket instance
 * @param {Function} next - Next middleware function
 */
export function handleSocketErrors(socket, next) {
  socket.on("error", (error) => {
    console.error("❌ Socket error:", error);
  });

  // Global error handler for unhandled events
  socket.onAny((eventName, ...args) => {
    try {
      // Event will be handled by registered handlers
    } catch (error) {
      console.error(`❌ Error in socket event ${eventName}:`, error);
      socket.emit("error", {
        event: eventName,
        error: error.message,
        timestamp: new Date(),
      });
    }
  });

  next();
}

/**
 * Extract user information from token
 * @param {string} token - Authentication token
 * @returns {Object|null} User object or null
 */
function extractUserFromToken(token) {
  try {
    // TODO: Implement proper JWT token parsing
    // For now, return a mock user object
    return {
      id: "mock_user_id",
      name: "Mock User",
      email: "mock@example.com",
    };
  } catch (error) {
    return null;
  }
}

/**
 * Sanitize socket data recursively
 * @param {any} data - Data to sanitize
 * @returns {any} Sanitized data
 */
function sanitizeSocketData(data) {
  if (typeof data === "string") {
    return sanitizeInput(data);
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeSocketData);
  }

  if (data && typeof data === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeSocketData(value);
    }
    return sanitized;
  }

  return data;
}

/**
 * Socket room management
 */
export class SocketRoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
  }

  /**
   * Join user to conversation room
   * @param {string} user_id - User ID
   * @param {string} conversation_id - Conversation ID
   * @param {Object} socket - Socket instance
   */
  joinConversationRoom(user_id, conversation_id, socket) {
    const roomName = `conversation:${conversation_id}`;
    socket.join(roomName);

    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }
    this.rooms.get(roomName).add(user_id);

    console.log(
      `👥 User ${user_id} joined conversation room ${conversation_id}`
    );
  }

  /**
   * Leave user from conversation room
   * @param {string} user_id - User ID
   * @param {string} conversation_id - Conversation ID
   * @param {Object} socket - Socket instance
   */
  leaveConversationRoom(user_id, conversation_id, socket) {
    const roomName = `conversation:${conversation_id}`;
    socket.leave(roomName);

    if (this.rooms.has(roomName)) {
      this.rooms.get(roomName).delete(user_id);
      if (this.rooms.get(roomName).size === 0) {
        this.rooms.delete(roomName);
      }
    }

    console.log(`👥 User ${user_id} left conversation room ${conversation_id}`);
  }

  /**
   * Emit to conversation room
   * @param {string} conversation_id - Conversation ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitToConversationRoom(conversation_id, event, data) {
    const roomName = `conversation:${conversation_id}`;
    this.io.to(roomName).emit(event, {
      ...data,
      conversation_id,
      timestamp: new Date(),
    });
  }

  /**
   * Get room participants
   * @param {string} conversation_id - Conversation ID
   * @returns {Set} Set of user IDs in the room
   */
  getRoomParticipants(conversation_id) {
    const roomName = `conversation:${conversation_id}`;
    return this.rooms.get(roomName) || new Set();
  }
}

/**
 * Socket connection manager
 */
export class SocketConnectionManager {
  constructor() {
    this.connections = new Map(); // user_id -> socket_id
    this.sockets = new Map(); // socket_id -> user_id
  }

  /**
   * Add connection
   * @param {string} user_id - User ID
   * @param {string} socket_id - Socket ID
   */
  addConnection(user_id, socket_id) {
    this.connections.set(user_id, socket_id);
    this.sockets.set(socket_id, user_id);
  }

  /**
   * Remove connection
   * @param {string} socket_id - Socket ID
   */
  removeConnection(socket_id) {
    const user_id = this.sockets.get(socket_id);
    if (user_id) {
      this.connections.delete(user_id);
      this.sockets.delete(socket_id);
    }
  }

  /**
   * Get socket ID for user
   * @param {string} user_id - User ID
   * @returns {string|null} Socket ID or null
   */
  getSocketId(user_id) {
    return this.connections.get(user_id) || null;
  }

  /**
   * Get user ID for socket
   * @param {string} socket_id - Socket ID
   * @returns {string|null} User ID or null
   */
  getUserId(socket_id) {
    return this.sockets.get(socket_id) || null;
  }

  /**
   * Get all connected users
   * @returns {Array} Array of user IDs
   */
  getConnectedUsers() {
    return Array.from(this.connections.keys());
  }

  /**
   * Check if user is connected
   * @param {string} user_id - User ID
   * @returns {boolean} Whether user is connected
   */
  isUserConnected(user_id) {
    return this.connections.has(user_id);
  }
}
