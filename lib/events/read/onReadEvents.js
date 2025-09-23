import Conversation from "../../../database/conversation.model.ts";
import Message from "../../../database/message.model.ts";
import {
  baseEventHandler,
  eventHandlerFactory,
} from "../../core/BaseEventHandler.js";

/**
 * Handle mark as read event
 * @param {Object} data - Mark as read data
 * @param {string} data.message_id - Message ID
 * @param {string} data.user_id - User ID marking as read
 * @param {string} data.conversation_id - Conversation ID
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onMarkAsRead = eventHandlerFactory.createReadHandler(
  async function (data, io, onlineUsers) {
    const { message_id, user_id } = data;

    this.logEvent("Mark as Read", user_id, { message_id });

    // Update message read status
    const message = await Message.findByIdAndUpdate(
      message_id,
      {
        $addToSet: { read_by: user_id },
        $set: { [`read_at.${user_id}`]: new Date() },
      },
      { new: true }
    );

    if (!message) {
      throw new Error("Message not found");
    }

    // Emit to conversation participants
    await baseEventHandler.emitToConversation(
      message.conversation.toString(),
      "messageRead",
      {
        message_id,
        user_id,
        read_at: message.read_at[user_id],
      },
      io,
      onlineUsers
    );

    return {
      message_id,
      user_id,
      read_at: message.read_at[user_id],
    };
  }
);

/**
 * Handle get reads event
 * @param {Object} data - Get reads data
 * @param {string} data.message_id - Message ID
 * @param {string} data.user_id - User ID requesting reads
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onGetReads(data, io, onlineUsers) {
  try {
    const { message_id, user_id } = data;

    console.log(`📋 Getting reads for message ${message_id}`);

    // Get message with reads
    const message = await Message.findById(message_id);

    if (!message) {
      throw new Error("Message not found");
    }

    // Find user socket
    const user = onlineUsers.find((u) => u.userId === user_id);
    const userSocket = user ? io.sockets.sockets.get(user.socketId) : null;

    if (userSocket) {
      userSocket.emit("readsRetrieved", {
        message_id,
        reads: message.read_by || [],
        read_count: message.read_by?.length || 0,
        timestamp: new Date(),
      });
    }

    return {
      success: true,
      message_id,
      reads: message.read_by || [],
    };
  } catch (error) {
    console.error("❌ Error getting reads:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle get message reads event
 * @param {Object} data - Get message reads data
 * @param {string} data.message_id - Message ID
 * @param {string} data.user_id - User ID requesting reads
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onGetMessageReads(data, io, onlineUsers) {
  try {
    const { message_id, user_id } = data;

    console.log(`📋 Getting message reads for ${message_id}`);

    // Get message with reads
    const message = await Message.findById(message_id);

    if (!message) {
      throw new Error("Message not found");
    }

    // Find user socket
    const user = onlineUsers.find((u) => u.userId === user_id);
    const userSocket = user ? io.sockets.sockets.get(user.socketId) : null;

    if (userSocket) {
      userSocket.emit("messageReadsRetrieved", {
        message_id,
        reads: message.read_by || [],
        read_count: message.read_by?.length || 0,
        timestamp: new Date(),
      });
    }

    return {
      success: true,
      message_id,
      reads: message.read_by || [],
    };
  } catch (error) {
    console.error("❌ Error getting message reads:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle delete read event
 * @param {Object} data - Delete read data
 * @param {string} data.message_id - Message ID
 * @param {string} data.user_id - User ID removing read status
 * @param {string} data.conversation_id - Conversation ID
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onDeleteRead(data, io, onlineUsers) {
  try {
    const { message_id, user_id, conversation_id } = data;

    console.log(
      `🗑️ Read status removed from message ${message_id} by ${user_id}`
    );

    // Remove read status from message
    const message = await Message.findByIdAndUpdate(
      message_id,
      {
        $pull: {
          read_by: {
            user: user_id,
          },
        },
      },
      { new: true }
    );

    if (!message) {
      throw new Error("Message not found");
    }

    // Get conversation participants
    const conversation = await Conversation.findById(conversation_id);
    const participants = conversation?.participants || [];

    // Emit to all participants
    for (const participant_id of participants) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id.toString()
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        participantSocket.emit("readStatusRemoved", {
          message_id,
          conversation_id,
          user_id,
          read_by_list: message.read_by || [],
          timestamp: new Date(),
        });
      }
    }

    return {
      success: true,
      message_id,
      user_id,
      read_by_list: message.read_by || [],
    };
  } catch (error) {
    console.error("❌ Error removing read status:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle mark conversation as read event
 * @param {Object} data - Mark conversation as read data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID marking as read
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onMarkConversationAsRead(data, io, onlineUsers) {
  try {
    const { conversation_id, user_id } = data;

    console.log(
      `👁️ Conversation ${conversation_id} marked as read by ${user_id}`
    );

    // Mark all unread messages in conversation as read
    const messages = await Message.updateMany(
      {
        conversation: conversation_id,
        read_by: { $ne: user_id },
      },
      {
        $addToSet: {
          read_by: {
            user: user_id,
            read_at: new Date(),
          },
        },
      }
    );

    // Get conversation participants
    const conversation = await Conversation.findById(conversation_id);
    const participants = conversation?.participants || [];

    // Emit to all participants
    for (const participant_id of participants) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id.toString()
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        participantSocket.emit("conversationMarkedAsRead", {
          conversation_id,
          read_by: user_id,
          read_at: new Date(),
          messages_updated: messages.modifiedCount,
          timestamp: new Date(),
        });
      }
    }

    return {
      success: true,
      conversation_id,
      read_by: user_id,
      messages_updated: messages.modifiedCount,
    };
  } catch (error) {
    console.error("❌ Error marking conversation as read:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle get unread count event
 * @param {Object} data - Get unread count data
 * @param {string} data.user_id - User ID requesting unread count
 * @param {string} data.conversation_id - Conversation ID (optional)
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onGetUnreadCount(data, io, onlineUsers) {
  try {
    const { user_id, conversation_id } = data;

    console.log(`📊 Getting unread count for user ${user_id}`);

    let unreadCount = 0;

    if (conversation_id) {
      // Get unread count for specific conversation
      unreadCount = await Message.countDocuments({
        conversation: conversation_id,
        read_by: { $ne: user_id },
        sender: { $ne: user_id },
      });
    } else {
      // Get total unread count for user
      const conversations = await Conversation.find({
        participants: user_id,
      });

      const conversationIds = conversations.map((conv) => conv._id);

      unreadCount = await Message.countDocuments({
        conversation: { $in: conversationIds },
        read_by: { $ne: user_id },
        sender: { $ne: user_id },
      });
    }

    // Find user socket
    const user = onlineUsers.find((u) => u.userId === user_id);
    const userSocket = user ? io.sockets.sockets.get(user.socketId) : null;

    if (userSocket) {
      userSocket.emit("unreadCountRetrieved", {
        user_id,
        conversation_id,
        unread_count: unreadCount,
        timestamp: new Date(),
      });
    }

    return {
      success: true,
      user_id,
      conversation_id,
      unread_count: unreadCount,
    };
  } catch (error) {
    console.error("❌ Error getting unread count:", error);
    return { success: false, error: error.message };
  }
}
