import Conversation from "../../../database/conversation.model.ts";
import Message from "../../../database/message.model.ts";
import Notification from "../../../database/notification.model.ts";
import {
  baseEventHandler,
  eventHandlerFactory,
} from "../../core/BaseEventHandler.js";
import { getConversationMessages } from "../../utils/dbUtils.js";

/**
 * Handle new message event
 * @param {Object} data - Message data
 * @param {string} data.sender_id - ID of the message sender
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.message_type - Type of message ('text', 'image', 'file', 'audio', 'video')
 * @param {string} data.message_content - Message content
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onNewMessage = eventHandlerFactory.createMessageHandler(
  async function (data, io, onlineUsers) {
    const { sender_id, conversation_id, message_type, message_content } = data;

    this.logEvent("New Message", sender_id, { conversation_id, message_type });

    // Get conversation with participants (cached)
    const conversation = await baseEventHandler.getConversationWithParticipants(
      conversation_id
    );
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const participants = conversation.participants.map((p) => p._id.toString());
    const isGroup = conversation.type === "group";

    // Create message in database
    const message = await Message.createMessage({
      senderId: sender_id,
      conversationId: conversation_id,
      type: message_type,
      content: baseEventHandler.sanitizeData(message_content),
    });

    // Prepare notification data
    const notificationData = baseEventHandler.createNotificationData(
      "message",
      isGroup ? `New message in ${conversation.name}` : "New Message",
      getMessageNotificationContent(message_type, message_content),
      {
        conversation_id,
        message_id: message._id,
        message_type,
        message_content: message_type === "text" ? message_content : null,
        sender_id,
        is_group: isGroup,
      }
    );

    // Categorize users by online status
    const { online, offline } = baseEventHandler.categorizeUsersByStatus(
      participants.filter((id) => id !== sender_id),
      onlineUsers
    );

    // Batch operations
    const operations = [];

    // Create notifications for offline users
    if (offline.length > 0) {
      const notificationPromises = offline.map((recipient_id) =>
        Notification.createNotification({
          ...notificationData,
          recipientId: recipient_id,
          senderId: sender_id,
        })
      );
      operations.push(...notificationPromises);
    }

    // Update conversation
    operations.push(
      Conversation.findByIdAndUpdate(conversation_id, {
        last_message: message._id,
        last_message_at: new Date(),
      })
    );

    // Execute batch operations
    await baseEventHandler.batchOperations(operations);

    // Emit to participants efficiently
    const messageData = {
      message_id: message._id,
      sender_id,
      conversation_id,
      message_type,
      message_content: message_type === "text" ? message_content : null,
      is_group: isGroup,
      group_name: isGroup ? conversation.name : null,
    };

    await baseEventHandler.emitToConversation(
      conversation_id,
      "newMessage",
      messageData,
      io,
      onlineUsers,
      [sender_id]
    );

    // Emit to sender for confirmation
    baseEventHandler.emitToUser(
      sender_id,
      "messageSent",
      {
        message_id: message._id,
        conversation_id,
        message_type,
      },
      io,
      onlineUsers
    );

    // Invalidate related caches
    baseEventHandler.invalidateCache(`conversation:${conversation_id}`);
    baseEventHandler.invalidateCache(`user_conversations:${sender_id}`);

    return {
      message_id: message._id,
      conversation_id,
      participants_count: participants.length,
      online_count: online.length,
      offline_count: offline.length,
    };
  }
);

/**
 * Handle update message event
 * @param {Object} data - Message update data
 * @param {string} data.message_id - Message ID
 * @param {string} data.user_id - User ID who is updating
 * @param {string} data.new_content - New message content
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onUpdateMessage = eventHandlerFactory.createMessageHandler(
  async function (data, io, onlineUsers) {
    const { message_id, user_id, new_content } = data;

    this.logEvent("Update Message", user_id, { message_id });

    // Update message in database
    const message = await Message.findByIdAndUpdate(
      message_id,
      {
        content: baseEventHandler.sanitizeData(new_content),
        edited_at: new Date(),
        is_edited: true,
      },
      { new: true }
    );

    if (!message) {
      throw new Error("Message not found");
    }

    // Emit to conversation participants
    await baseEventHandler.emitToConversation(
      message.conversation.toString(),
      "messageUpdated",
      {
        message_id,
        new_content,
        edited_by: user_id,
        edited_at: message.edited_at,
      },
      io,
      onlineUsers
    );

    return { message_id, edited_at: message.edited_at };
  }
);

/**
 * Handle delete message event
 * @param {Object} data - Message delete data
 * @param {string} data.message_id - Message ID
 * @param {string} data.user_id - User ID who is deleting
 * @param {string} data.delete_type - Type of deletion ('delete_for_me', 'delete_for_everyone')
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onDeleteMessage = eventHandlerFactory.createMessageHandler(
  async function (data, io, onlineUsers) {
    const { message_id, user_id, delete_type } = data;

    this.logEvent("Delete Message", user_id, { message_id, delete_type });

    const message = await Message.findById(message_id);
    if (!message) {
      throw new Error("Message not found");
    }

    if (delete_type === "delete_for_everyone") {
      await Message.findByIdAndDelete(message_id);
    } else {
      await Message.findByIdAndUpdate(message_id, {
        deleted_for: user_id,
        deleted_at: new Date(),
        is_deleted: true,
      });
    }

    // Emit to conversation participants
    await baseEventHandler.emitToConversation(
      message.conversation.toString(),
      "messageDeleted",
      {
        message_id,
        deleted_by: user_id,
        delete_type,
      },
      io,
      onlineUsers
    );

    return { message_id, delete_type };
  }
);

/**
 * Handle get messages event
 * @param {Object} data - Get messages data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID requesting messages
 * @param {number} data.page - Page number
 * @param {number} data.limit - Messages per page
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onGetMessages = eventHandlerFactory.createMessageHandler(
  async function (data, io, onlineUsers) {
    const { conversation_id, user_id, page = 1, limit = 50 } = data;

    this.logEvent("Get Messages", user_id, { conversation_id, page, limit });

    // Limit page size for performance
    const safeLimit = Math.min(limit, 100);
    const safePage = Math.max(page, 1);

    // Get messages with pagination (optimized)
    const result = await getConversationMessages(
      conversation_id,
      safePage,
      safeLimit
    );

    // Emit to user
    baseEventHandler.emitToUser(
      user_id,
      "messagesRetrieved",
      {
        conversation_id,
        messages: result.messages,
        pagination: result.pagination,
      },
      io,
      onlineUsers
    );

    return {
      messages: result.messages,
      pagination: result.pagination,
    };
  },
  { rateLimitAction: "get_messages", maxRequests: 20 }
);

/**
 * Handle get single message event
 * @param {Object} data - Get message data
 * @param {string} data.message_id - Message ID
 * @param {string} data.user_id - User ID requesting message
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onGetMessage = eventHandlerFactory.createMessageHandler(
  async function (data, io, onlineUsers) {
    const { message_id, user_id } = data;

    this.logEvent("Get Message", user_id, { message_id });

    const message = await Message.findById(message_id);
    if (!message) {
      throw new Error("Message not found");
    }

    // Emit to user
    baseEventHandler.emitToUser(
      user_id,
      "messageRetrieved",
      { message },
      io,
      onlineUsers
    );

    return { message };
  }
);

/**
 * Handle get conversation messages event
 * @param {Object} data - Get conversation messages data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID requesting messages
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onGetConversationMessages =
  eventHandlerFactory.createMessageHandler(async function (
    data,
    io,
    onlineUsers
  ) {
    const { conversation_id, user_id } = data;

    this.logEvent("Get Conversation Messages", user_id, { conversation_id });

    const messages = await Message.find({ conversation: conversation_id })
      .populate("sender", "name avatar")
      .sort({ created_at: -1 })
      .limit(100);

    // Emit to user
    baseEventHandler.emitToUser(
      user_id,
      "conversationMessagesRetrieved",
      {
        conversation_id,
        messages: messages.reverse(),
      },
      io,
      onlineUsers
    );

    return { messages: messages.reverse() };
  });

/**
 * Get appropriate notification content based on message type
 */
function getMessageNotificationContent(message_type, message_content) {
  switch (message_type) {
    case "text":
      return message_content || "You have a new message";
    case "image":
      return "📷 Sent a photo";
    case "file":
      return "📎 Sent a file";
    case "audio":
      return "🎵 Sent an audio message";
    case "video":
      return "🎥 Sent a video";
    case "voice_note":
      return "🎤 Sent a voice note";
    case "location":
      return "📍 Shared a location";
    case "call_log":
      return "📞 Call log";
    default:
      return "You have a new message";
  }
}
