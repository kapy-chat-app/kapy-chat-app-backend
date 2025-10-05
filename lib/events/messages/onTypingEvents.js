// socket/events/messages/onTypingEvents.js
import Conversation from "../../../database/conversation.model.ts";
import {
  baseEventHandler,
  eventHandlerFactory,
} from "../../core/BaseEventHandler.js";

/**
 * Handle user typing event
 * @param {Object} data - Typing data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID who is typing
 * @param {string} data.user_name - User name
 * @param {boolean} data.is_typing - Whether user is typing
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onUserTyping = eventHandlerFactory.createMessageHandler(
  async function (data, io, onlineUsers) {
    const { conversation_id, user_id, user_name, is_typing } = data;

    this.logEvent("User Typing", user_id, { 
      conversation_id, 
      is_typing,
      user_name 
    });

    // Verify conversation exists
    const conversation = await Conversation.findById(conversation_id);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Verify user is participant
    const isParticipant = conversation.participants.some(
      (p) => p._id.toString() === user_id
    );
    if (!isParticipant) {
      throw new Error("User is not a participant");
    }

    // Emit to conversation room (excluding sender)
    await baseEventHandler.emitToConversation(
      conversation_id,
      "userTyping",
      {
        conversation_id,
        user_id,
        user_name,
        is_typing,
        timestamp: new Date(),
      },
      io,
      onlineUsers,
      [user_id] // Exclude sender
    );

    return {
      conversation_id,
      user_id,
      is_typing,
    };
  }
);

/**
 * Handle stop typing event (explicit stop)
 * @param {Object} data - Stop typing data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onStopTyping = eventHandlerFactory.createMessageHandler(
  async function (data, io, onlineUsers) {
    const { conversation_id, user_id } = data;

    this.logEvent("Stop Typing", user_id, { conversation_id });

    // Emit stop typing
    await baseEventHandler.emitToConversation(
      conversation_id,
      "userTyping",
      {
        conversation_id,
        user_id,
        is_typing: false,
        timestamp: new Date(),
      },
      io,
      onlineUsers,
      [user_id]
    );

    return {
      conversation_id,
      user_id,
      is_typing: false,
    };
  }
);