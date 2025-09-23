import Conversation from "../../../database/conversation.model.ts";
import User from "../../../database/user.model.ts";
import {
  baseEventHandler,
  eventHandlerFactory,
} from "../../core/BaseEventHandler.js";

/**
 * Handle new conversation event
 * @param {Object} data - New conversation data
 * @param {string} data.creator_id - ID of the conversation creator
 * @param {string[]} data.participant_ids - Array of participant IDs
 * @param {string} data.conversation_type - Type of conversation ('direct' or 'group')
 * @param {string} data.name - Conversation name (for groups)
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onNewConversation = eventHandlerFactory.createConversationHandler(
  async function (data, io, onlineUsers) {
    const { creator_id, participant_ids, conversation_type, name } = data;

    this.logEvent("New Conversation", creator_id, {
      participant_count: participant_ids.length,
      conversation_type,
    });

    // Validate participants
    if (participant_ids.length < 2) {
      throw new Error("At least 2 participants required");
    }

    // Check if users exist
    const users = await User.find({ _id: { $in: participant_ids } });
    if (users.length !== participant_ids.length) {
      throw new Error("Some users not found");
    }

    // Create conversation in database
    const conversation = await Conversation.createConversation({
      creatorId: creator_id,
      participantIds: participant_ids,
      type: conversation_type,
      name: baseEventHandler.sanitizeData(name) || null,
    });

    // Emit to all participants
    baseEventHandler.emitToUsers(
      participant_ids,
      "newConversation",
      {
        conversation_id: conversation._id,
        conversation_type,
        name: conversation.name,
        participants: participant_ids,
        creator_id,
      },
      io,
      onlineUsers
    );

    return {
      conversation_id: conversation._id,
      participants: participant_ids,
      conversation_type,
    };
  }
);

/**
 * Handle update conversation event
 * @param {Object} data - Update conversation data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID updating
 * @param {Object} data.updates - Updates to apply
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onUpdateConversation =
  eventHandlerFactory.createConversationHandler(async function (
    data,
    io,
    onlineUsers
  ) {
    const { conversation_id, user_id, updates } = data;

    this.logEvent("Update Conversation", user_id, { conversation_id });

    // Update conversation in database
    const conversation = await Conversation.findByIdAndUpdate(
      conversation_id,
      {
        ...updates,
        updated_at: new Date(),
      },
      { new: true }
    );

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Emit to all participants
    await baseEventHandler.emitToConversation(
      conversation_id,
      "conversationUpdated",
      {
        conversation_id,
        updates,
        updated_by: user_id,
      },
      io,
      onlineUsers
    );

    return {
      conversation_id,
      updates,
    };
  });

/**
 * Handle delete conversation event
 * @param {Object} data - Delete conversation data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID deleting
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onDeleteConversation =
  eventHandlerFactory.createConversationHandler(async function (
    data,
    io,
    onlineUsers
  ) {
    const { conversation_id, user_id } = data;

    this.logEvent("Delete Conversation", user_id, { conversation_id });

    // Get conversation before deleting
    const conversation = await Conversation.findById(conversation_id);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const participants = conversation.participants.map((p) => p.toString());

    // Delete conversation
    await Conversation.findByIdAndDelete(conversation_id);

    // Emit to all participants
    baseEventHandler.emitToUsers(
      participants,
      "conversationDeleted",
      {
        conversation_id,
        deleted_by: user_id,
      },
      io,
      onlineUsers
    );

    return {
      conversation_id,
      status: "deleted",
    };
  });

/**
 * Handle get conversations event
 * @param {Object} data - Get conversations data
 * @param {string} data.user_id - User ID requesting conversations
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onGetConversations(data, io, onlineUsers) {
  try {
    const { user_id } = data;

    console.log(`📋 Getting conversations for user ${user_id}`);

    // Get conversations from database
    const conversations = await Conversation.getConversationsByUser(user_id);

    // Find user socket
    const user = onlineUsers.find((u) => u.userId === user_id);
    const userSocket = user ? io.sockets.sockets.get(user.socketId) : null;

    if (userSocket) {
      userSocket.emit("conversationsRetrieved", {
        conversations,
        conversation_count: conversations.length,
        timestamp: new Date(),
      });
    }

    return { success: true, conversations };
  } catch (error) {
    console.error("❌ Error getting conversations:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle get single conversation event
 * @param {Object} data - Get conversation data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID requesting conversation
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onGetConversation(data, io, onlineUsers) {
  try {
    const { conversation_id, user_id } = data;

    console.log(`📄 Getting conversation ${conversation_id}`);

    // Get conversation from database
    const conversation = await Conversation.findById(conversation_id);

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Find user socket
    const user = onlineUsers.find((u) => u.userId === user_id);
    const userSocket = user ? io.sockets.sockets.get(user.socketId) : null;

    if (userSocket) {
      userSocket.emit("conversationRetrieved", {
        conversation,
        timestamp: new Date(),
      });
    }

    return { success: true, conversation };
  } catch (error) {
    console.error("❌ Error getting conversation:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle get conversation participants event
 * @param {Object} data - Get participants data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID requesting participants
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onGetConversationParticipants(data, io, onlineUsers) {
  try {
    const { conversation_id, user_id } = data;

    console.log(`👥 Getting participants for conversation ${conversation_id}`);

    // Get conversation participants from database
    const participants = await Conversation.getConversationParticipants(
      conversation_id
    );

    // Find user socket
    const user = onlineUsers.find((u) => u.userId === user_id);
    const userSocket = user ? io.sockets.sockets.get(user.socketId) : null;

    if (userSocket) {
      userSocket.emit("conversationParticipantsRetrieved", {
        conversation_id,
        participants,
        participant_count: participants.length,
        timestamp: new Date(),
      });
    }

    return { success: true, participants };
  } catch (error) {
    console.error("❌ Error getting conversation participants:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle create group event
 * @param {Object} data - Create group data
 * @param {string} data.creator_id - ID of the group creator
 * @param {string[]} data.participant_ids - Array of participant IDs
 * @param {string} data.group_name - Group name
 * @param {string} data.group_description - Group description
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onCreateGroup(data, io, onlineUsers) {
  try {
    const { creator_id, participant_ids, group_name, group_description } = data;

    console.log(`👥 Group "${group_name}" created by ${creator_id}`);

    // Create group conversation
    const conversation = await Conversation.createConversation({
      creatorId: creator_id,
      participantIds: participant_ids,
      type: "group",
      name: group_name,
      description: group_description,
    });

    console.log(`✅ Group created with ID: ${conversation._id}`);

    // Emit to all participants
    for (const participant_id of participant_ids) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        participantSocket.emit("groupCreated", {
          conversation_id: conversation._id,
          group_name,
          group_description,
          participants: participant_ids,
          creator_id,
          timestamp: new Date(),
        });
      }
    }

    return {
      success: true,
      conversation_id: conversation._id,
      group_name,
    };
  } catch (error) {
    console.error("❌ Error creating group:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle update group info event
 * @param {Object} data - Update group info data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID updating
 * @param {Object} data.group_info - Group info updates
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onUpdateGroupInfo(data, io, onlineUsers) {
  try {
    const { conversation_id, user_id, group_info } = data;

    console.log(`✏️ Group ${conversation_id} info updated by ${user_id}`);

    // Update group info
    const conversation = await Conversation.findByIdAndUpdate(
      conversation_id,
      {
        ...group_info,
        updated_at: new Date(),
      },
      { new: true }
    );

    if (!conversation) {
      throw new Error("Group not found");
    }

    // Get participants
    const participants = conversation.participants || [];

    // Emit to all participants
    for (const participant_id of participants) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id.toString()
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        participantSocket.emit("groupInfoUpdated", {
          conversation_id,
          group_info,
          updated_by: user_id,
          timestamp: new Date(),
        });
      }
    }

    return { success: true, conversation_id };
  } catch (error) {
    console.error("❌ Error updating group info:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle add group member event
 * @param {Object} data - Add group member data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID being added
 * @param {string} data.added_by - User ID who is adding
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onAddGroupMember(data, io, onlineUsers) {
  try {
    const { conversation_id, user_id, added_by } = data;

    console.log(
      `👥 User ${user_id} added to group ${conversation_id} by ${added_by}`
    );

    // Add member to group
    const conversation = await Conversation.findByIdAndUpdate(
      conversation_id,
      {
        $addToSet: { participants: user_id },
        updated_at: new Date(),
      },
      { new: true }
    );

    if (!conversation) {
      throw new Error("Group not found");
    }

    // Get participants
    const participants = conversation.participants || [];

    // Emit to all participants
    for (const participant_id of participants) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id.toString()
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        participantSocket.emit("groupMemberAdded", {
          conversation_id,
          user_id,
          added_by,
          participants,
          participant_count: participants.length,
          timestamp: new Date(),
        });
      }
    }

    return {
      success: true,
      conversation_id,
      participants,
      participant_count: participants.length,
    };
  } catch (error) {
    console.error("❌ Error adding group member:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle remove group member event
 * @param {Object} data - Remove group member data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID being removed
 * @param {string} data.removed_by - User ID who is removing
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onRemoveGroupMember(data, io, onlineUsers) {
  try {
    const { conversation_id, user_id, removed_by } = data;

    console.log(
      `👥 User ${user_id} removed from group ${conversation_id} by ${removed_by}`
    );

    // Remove member from group
    const conversation = await Conversation.findByIdAndUpdate(
      conversation_id,
      {
        $pull: { participants: user_id },
        updated_at: new Date(),
      },
      { new: true }
    );

    if (!conversation) {
      throw new Error("Group not found");
    }

    // Get participants
    const participants = conversation.participants || [];

    // Emit to all participants
    for (const participant_id of participants) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id.toString()
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        participantSocket.emit("groupMemberRemoved", {
          conversation_id,
          user_id,
          removed_by,
          participants,
          participant_count: participants.length,
          timestamp: new Date(),
        });
      }
    }

    // Emit to removed user
    const removedUser = onlineUsers.find((user) => user.userId === user_id);
    const removedSocket = removedUser
      ? io.sockets.sockets.get(removedUser.socketId)
      : null;

    if (removedSocket) {
      removedSocket.emit("groupMemberRemoved", {
        conversation_id,
        user_id,
        removed_by,
        timestamp: new Date(),
      });
    }

    return {
      success: true,
      conversation_id,
      participants,
      participant_count: participants.length,
    };
  } catch (error) {
    console.error("❌ Error removing group member:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle leave group event
 * @param {Object} data - Leave group data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID leaving
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onLeaveGroup(data, io, onlineUsers) {
  try {
    const { conversation_id, user_id } = data;

    console.log(`👥 User ${user_id} leaving group ${conversation_id}`);

    // Remove user from group
    const conversation = await Conversation.findByIdAndUpdate(
      conversation_id,
      {
        $pull: { participants: user_id },
        updated_at: new Date(),
      },
      { new: true }
    );

    if (!conversation) {
      throw new Error("Group not found");
    }

    // Get participants
    const participants = conversation.participants || [];

    // Emit to remaining participants
    for (const participant_id of participants) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id.toString()
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        participantSocket.emit("groupMemberLeft", {
          conversation_id,
          user_id,
          participants,
          participant_count: participants.length,
          timestamp: new Date(),
        });
      }
    }

    // Emit to user who left
    const leftUser = onlineUsers.find((user) => user.userId === user_id);
    const leftSocket = leftUser
      ? io.sockets.sockets.get(leftUser.socketId)
      : null;

    if (leftSocket) {
      leftSocket.emit("groupLeft", {
        conversation_id,
        user_id,
        timestamp: new Date(),
      });
    }

    return {
      success: true,
      conversation_id,
      participants,
      participant_count: participants.length,
    };
  } catch (error) {
    console.error("❌ Error leaving group:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle delete group event
 * @param {Object} data - Delete group data
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.user_id - User ID deleting
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onDeleteGroup(data, io, onlineUsers) {
  try {
    const { conversation_id, user_id } = data;

    console.log(`🗑️ Group ${conversation_id} deleted by ${user_id}`);

    // Get group before deleting
    const conversation = await Conversation.findById(conversation_id);
    if (!conversation) {
      throw new Error("Group not found");
    }

    // Delete group
    await Conversation.findByIdAndDelete(conversation_id);

    // Get participants
    const participants = conversation.participants || [];

    // Emit to all participants
    for (const participant_id of participants) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id.toString()
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        participantSocket.emit("groupDeleted", {
          conversation_id,
          deleted_by: user_id,
          timestamp: new Date(),
        });
      }
    }

    return { success: true, conversation_id };
  } catch (error) {
    console.error("❌ Error deleting group:", error);
    return { success: false, error: error.message };
  }
}
