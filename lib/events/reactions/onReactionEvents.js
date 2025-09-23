import Conversation from "../../../database/conversation.model.ts";
import Message from "../../../database/message.model.ts";
import Notification from "../../../database/notification.model.ts";
import {
  baseEventHandler,
  eventHandlerFactory,
} from "../../core/BaseEventHandler.js";

/**
 * Handle new reaction event
 * @param {Object} data - New reaction data
 * @param {string} data.message_id - Message ID
 * @param {string} data.user_id - User ID reacting
 * @param {string} data.reaction - Reaction emoji
 * @param {string} data.conversation_id - Conversation ID
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onNewReaction = eventHandlerFactory.createReactionHandler(
  async function (data, io, onlineUsers) {
    const { message_id, user_id, reaction } = data;

    this.logEvent("New Reaction", user_id, { message_id, reaction });

    // Add reaction to message
    const message = await Message.findByIdAndUpdate(
      message_id,
      {
        $addToSet: {
          reactions: {
            user: user_id,
            reaction: baseEventHandler.sanitizeData(reaction),
            created_at: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!message) {
      throw new Error("Message not found");
    }

    // Emit to conversation participants
    await baseEventHandler.emitToConversation(
      message.conversation.toString(),
      "messageReactionAdded",
      {
        message_id,
        user_id,
        reaction,
        reactions: message.reactions,
      },
      io,
      onlineUsers
    );

    // Create notification for message sender if different from reactor
    if (message.sender.toString() !== user_id) {
      const notification = await Notification.createNotification({
        recipientId: message.sender.toString(),
        senderId: user_id,
        type: "message",
        title: "Message Reaction",
        content: `Someone reacted ${reaction} to your message`,
        data: {
          conversation_id: message.conversation,
          message_id,
          reaction,
          reactor_id: user_id,
        },
        deliveryMethod: "in_app",
      });

      // Emit to message sender
      baseEventHandler.emitToUser(
        message.sender.toString(),
        "messageReaction",
        {
          notification_id: notification._id,
          message_id,
          conversation_id: message.conversation,
          reaction,
          reactor_id: user_id,
        },
        io,
        onlineUsers
      );

      await notification.markAsDelivered();
    }

    return {
      message_id,
      user_id,
      reaction,
      reactions: message.reactions,
    };
  }
);

/**
 * Handle delete reaction event
 * @param {Object} data - Delete reaction data
 * @param {string} data.message_id - Message ID
 * @param {string} data.user_id - User ID removing reaction
 * @param {string} data.reaction - Reaction emoji to remove
 * @param {string} data.conversation_id - Conversation ID
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onDeleteReaction(data, io, onlineUsers) {
  try {
    const { message_id, user_id, reaction, conversation_id } = data;

    console.log(
      `🗑️ Reaction ${reaction} removed from message ${message_id} by ${user_id}`
    );

    // Remove reaction from message
    const message = await Message.findByIdAndUpdate(
      message_id,
      {
        $pull: {
          reactions: {
            user: user_id,
            reaction: reaction,
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
        participantSocket.emit("reactionRemoved", {
          message_id,
          conversation_id,
          user_id,
          reaction,
          reactions: message.reactions,
          timestamp: new Date(),
        });
      }
    }

    return {
      success: true,
      message_id,
      reaction,
      reactions: message.reactions,
    };
  } catch (error) {
    console.error("❌ Error removing reaction:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle get reactions event
 * @param {Object} data - Get reactions data
 * @param {string} data.message_id - Message ID
 * @param {string} data.user_id - User ID requesting reactions
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onGetReactions(data, io, onlineUsers) {
  try {
    const { message_id, user_id } = data;

    console.log(`📋 Getting reactions for message ${message_id}`);

    // Get message with reactions
    const message = await Message.findById(message_id);

    if (!message) {
      throw new Error("Message not found");
    }

    // Find user socket
    const user = onlineUsers.find((u) => u.userId === user_id);
    const userSocket = user ? io.sockets.sockets.get(user.socketId) : null;

    if (userSocket) {
      userSocket.emit("reactionsRetrieved", {
        message_id,
        reactions: message.reactions || [],
        reaction_count: message.reactions?.length || 0,
        timestamp: new Date(),
      });
    }

    return {
      success: true,
      message_id,
      reactions: message.reactions || [],
    };
  } catch (error) {
    console.error("❌ Error getting reactions:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle get message reactions event
 * @param {Object} data - Get message reactions data
 * @param {string} data.message_id - Message ID
 * @param {string} data.user_id - User ID requesting reactions
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onGetMessageReactions(data, io, onlineUsers) {
  try {
    const { message_id, user_id } = data;

    console.log(`📋 Getting message reactions for ${message_id}`);

    // Get message with reactions
    const message = await Message.findById(message_id);

    if (!message) {
      throw new Error("Message not found");
    }

    // Find user socket
    const user = onlineUsers.find((u) => u.userId === user_id);
    const userSocket = user ? io.sockets.sockets.get(user.socketId) : null;

    if (userSocket) {
      userSocket.emit("messageReactionsRetrieved", {
        message_id,
        reactions: message.reactions || [],
        reaction_count: message.reactions?.length || 0,
        timestamp: new Date(),
      });
    }

    return {
      success: true,
      message_id,
      reactions: message.reactions || [],
    };
  } catch (error) {
    console.error("❌ Error getting message reactions:", error);
    return { success: false, error: error.message };
  }
}
