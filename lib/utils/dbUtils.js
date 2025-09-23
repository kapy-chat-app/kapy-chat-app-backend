/**
 * Database utility functions for optimized queries
 */

import Call from "../../database/call.model.ts";
import Conversation from "../../database/conversation.model.ts";
import Friendship from "../../database/friendship.model.ts";
import Message from "../../database/message.model.ts";
import User from "../../database/user.model.ts";

/**
 * Cache for frequently accessed data
 */
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Cache entry structure
 */
class CacheEntry {
  constructor(data, ttl = CACHE_TTL) {
    this.data = data;
    this.expiresAt = Date.now() + ttl;
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }
}

/**
 * Get cached data or fetch from database
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Function to fetch data if not cached
 * @param {number} ttl - Time to live in milliseconds
 * @returns {Promise<any>} Cached or fresh data
 */
export async function getCachedOrFetch(key, fetchFn, ttl = CACHE_TTL) {
  const cached = cache.get(key);

  if (cached && !cached.isExpired()) {
    return cached.data;
  }

  const data = await fetchFn();
  cache.set(key, new CacheEntry(data, ttl));
  return data;
}

/**
 * Invalidate cache entries by pattern
 * @param {string} pattern - Pattern to match cache keys
 */
export function invalidateCache(pattern) {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
}

/**
 * Get conversation with participants (cached)
 * @param {string} conversation_id - Conversation ID
 * @returns {Promise<Object>} Conversation with participants
 */
export async function getConversationWithParticipants(conversation_id) {
  return getCachedOrFetch(
    `conversation:${conversation_id}`,
    () =>
      Conversation.findById(conversation_id).populate(
        "participants",
        "name avatar"
      ),
    2 * 60 * 1000 // 2 minutes cache
  );
}

/**
 * Get user conversations (cached)
 * @param {string} user_id - User ID
 * @returns {Promise<Array>} User conversations
 */
export async function getUserConversations(user_id) {
  return getCachedOrFetch(
    `user_conversations:${user_id}`,
    () =>
      Conversation.find({ participants: user_id })
        .populate("participants", "name avatar")
        .sort({ updated_at: -1 })
        .limit(50),
    3 * 60 * 1000 // 3 minutes cache
  );
}

/**
 * Get conversation messages with pagination
 * @param {string} conversation_id - Conversation ID
 * @param {number} page - Page number
 * @param {number} limit - Messages per page
 * @returns {Promise<Object>} Messages with pagination info
 */
export async function getConversationMessages(
  conversation_id,
  page = 1,
  limit = 50
) {
  const skip = (page - 1) * limit;

  const [messages, total] = await Promise.all([
    Message.find({ conversation: conversation_id })
      .populate("sender", "name avatar")
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit),
    Message.countDocuments({ conversation: conversation_id }),
  ]);

  return {
    messages: messages.reverse(), // Reverse to get chronological order
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}

/**
 * Get user friends (cached)
 * @param {string} user_id - User ID
 * @returns {Promise<Array>} User friends
 */
export async function getUserFriends(user_id) {
  return getCachedOrFetch(
    `user_friends:${user_id}`,
    () =>
      Friendship.find({
        $or: [
          { requester: user_id, status: "accepted" },
          { recipient: user_id, status: "accepted" },
        ],
      }).populate("requester recipient", "name avatar"),
    5 * 60 * 1000 // 5 minutes cache
  );
}

/**
 * Get user friend requests (cached)
 * @param {string} user_id - User ID
 * @returns {Promise<Array>} User friend requests
 */
export async function getUserFriendRequests(user_id) {
  return getCachedOrFetch(
    `user_friend_requests:${user_id}`,
    () =>
      Friendship.find({
        recipient: user_id,
        status: "pending",
      }).populate("requester", "name avatar"),
    2 * 60 * 1000 // 2 minutes cache
  );
}

/**
 * Get online users from database
 * @param {Array} user_ids - Array of user IDs
 * @returns {Promise<Array>} User information
 */
export async function getUsersInfo(user_ids) {
  if (!user_ids || user_ids.length === 0) return [];

  return getCachedOrFetch(
    `users_info:${user_ids.sort().join(",")}`,
    () => User.find({ _id: { $in: user_ids } }).select("name avatar status"),
    1 * 60 * 1000 // 1 minute cache
  );
}

/**
 * Batch update messages
 * @param {Array} message_ids - Array of message IDs
 * @param {Object} update - Update object
 * @returns {Promise<Object>} Update result
 */
export async function batchUpdateMessages(message_ids, update) {
  const result = await Message.updateMany(
    { _id: { $in: message_ids } },
    { ...update, updated_at: new Date() }
  );

  // Invalidate related caches
  invalidateCache("conversation:");

  return result;
}

/**
 * Get unread message count for user
 * @param {string} user_id - User ID
 * @param {string} conversation_id - Conversation ID (optional)
 * @returns {Promise<number>} Unread count
 */
export async function getUnreadCount(user_id, conversation_id = null) {
  const query = {
    read_by: { $ne: user_id },
    sender: { $ne: user_id },
  };

  if (conversation_id) {
    query.conversation = conversation_id;
  } else {
    // Get all conversations user is part of
    const conversations = await Conversation.find({ participants: user_id });
    query.conversation = { $in: conversations.map((c) => c._id) };
  }

  return Message.countDocuments(query);
}

/**
 * Get active calls for user
 * @param {string} user_id - User ID
 * @returns {Promise<Array>} Active calls
 */
export async function getActiveCalls(user_id) {
  return Call.find({
    $or: [
      { callerId: user_id },
      { recipientId: user_id },
      { participants: user_id },
    ],
    status: { $in: ["ringing", "active"] },
  }).populate("callerId recipientId", "name avatar");
}

/**
 * Optimized conversation search
 * @param {string} user_id - User ID
 * @param {string} searchTerm - Search term
 * @returns {Promise<Array>} Matching conversations
 */
export async function searchConversations(user_id, searchTerm) {
  const regex = new RegExp(searchTerm, "i");

  return Conversation.find({
    participants: user_id,
    $or: [{ name: regex }, { description: regex }],
  })
    .populate("participants", "name avatar")
    .sort({ updated_at: -1 })
    .limit(20);
}

/**
 * Get conversation statistics
 * @param {string} conversation_id - Conversation ID
 * @returns {Promise<Object>} Conversation statistics
 */
export async function getConversationStats(conversation_id) {
  const [messageCount, participantCount, lastMessage] = await Promise.all([
    Message.countDocuments({ conversation: conversation_id }),
    Conversation.findById(conversation_id).then(
      (conv) => conv?.participants?.length || 0
    ),
    Message.findOne({ conversation: conversation_id })
      .sort({ created_at: -1 })
      .populate("sender", "name"),
  ]);

  return {
    message_count: messageCount,
    participant_count: participantCount,
    last_message: lastMessage,
  };
}

/**
 * Clean up expired cache entries
 */
export function cleanupCache() {
  for (const [key, entry] of cache.entries()) {
    if (entry.isExpired()) {
      cache.delete(key);
    }
  }
}

// Clean up cache every 10 minutes
setInterval(cleanupCache, 10 * 60 * 1000);

/**
 * Database connection health check
 * @returns {Promise<Object>} Health status
 */
export async function checkDatabaseHealth() {
  try {
    const [userCount, messageCount, conversationCount] = await Promise.all([
      User.countDocuments(),
      Message.countDocuments(),
      Conversation.countDocuments(),
    ]);

    return {
      status: "healthy",
      user_count: userCount,
      message_count: messageCount,
      conversation_count: conversationCount,
      cache_size: cache.size,
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
      timestamp: new Date(),
    };
  }
}
