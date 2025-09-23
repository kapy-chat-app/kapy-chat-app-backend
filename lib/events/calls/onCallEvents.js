import Call from "../../../database/call.model.ts";
import Conversation from "../../../database/conversation.model.ts";
import Notification from "../../../database/notification.model.ts";
import {
  baseEventHandler,
  eventHandlerFactory,
} from "../../core/BaseEventHandler.js";

/**
 * Handle start call event
 * @param {Object} data - Start call data
 * @param {string} data.caller_id - ID of the caller
 * @param {string} data.recipient_id - ID of the recipient
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.call_type - Call type ('audio' or 'video')
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onStartCall = eventHandlerFactory.createCallHandler(
  async function (data, io, onlineUsers) {
    const { caller_id, recipient_id, conversation_id, call_type } = data;

    this.logEvent("Start Call", caller_id, { recipient_id, call_type });

    // Validate call type
    const validTypes = ["audio", "video"];
    if (!validTypes.includes(call_type)) {
      throw new Error(`Invalid call type: ${call_type}`);
    }

    // Create call in database
    const call = await Call.createCall({
      callerId: caller_id,
      recipientId: recipient_id,
      conversationId: conversation_id,
      type: call_type,
      status: "ringing",
    });

    // Emit to recipient if online
    baseEventHandler.emitToUser(
      recipient_id,
      "incomingCall",
      {
        call_id: call._id,
        caller_id,
        call_type,
        conversation_id,
      },
      io,
      onlineUsers
    );

    // Emit to caller for confirmation
    baseEventHandler.emitToUser(
      caller_id,
      "callStarted",
      {
        call_id: call._id,
        recipient_id,
        call_type,
        conversation_id,
        status: "ringing",
      },
      io,
      onlineUsers
    );

    // Create notification for offline recipient
    if (!baseEventHandler.isUserOnline(recipient_id, onlineUsers)) {
      await Notification.createNotification({
        recipientId: recipient_id,
        senderId: caller_id,
        type: "call",
        title: `Incoming ${call_type} call`,
        content: `You have an incoming ${call_type} call`,
        data: {
          call_id: call._id,
          conversation_id,
          call_type,
          caller_id,
        },
        deliveryMethod: "in_app",
      });
    }

    return {
      call_id: call._id,
      status: "ringing",
    };
  }
);

/**
 * Handle join call event
 * @param {Object} data - Join call data
 * @param {string} data.call_id - Call ID
 * @param {string} data.user_id - User ID joining
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export const onJoinCall = eventHandlerFactory.createCallHandler(async function (
  data,
  io,
  onlineUsers
) {
  const { call_id, user_id } = data;

  this.logEvent("Join Call", user_id, { call_id });

  // Update call status
  const call = await Call.findByIdAndUpdate(
    call_id,
    {
      status: "active",
      startedAt: new Date(),
      participants: [call.callerId, call.recipientId],
    },
    { new: true }
  );

  if (!call) {
    throw new Error("Call not found");
  }

  // Emit to conversation participants
  await baseEventHandler.emitToConversation(
    call.conversationId.toString(),
    "callJoined",
    {
      call_id,
      user_id,
      status: "active",
      participants: call.participants,
    },
    io,
    onlineUsers
  );

  return { call_id, status: "active" };
});

/**
 * Handle end call event
 * @param {Object} data - End call data
 * @param {string} data.call_id - Call ID
 * @param {string} data.user_id - User ID ending call
 * @param {number} data.duration - Call duration in seconds
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onEndCall(data, io, onlineUsers) {
  try {
    const { call_id, user_id, duration = 0 } = data;

    console.log(
      `📞 Call ${call_id} ended by ${user_id}, duration: ${duration}s`
    );

    // Update call status
    const call = await Call.findByIdAndUpdate(
      call_id,
      {
        status: "ended",
        endedAt: new Date(),
        duration: duration,
        endedBy: user_id,
      },
      { new: true }
    );

    if (!call) {
      throw new Error("Call not found");
    }

    // Get conversation participants
    const conversation = await Conversation.findById(call.conversationId);
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
        participantSocket.emit("callEnded", {
          call_id,
          ended_by: user_id,
          duration,
          status: "ended",
          timestamp: new Date(),
        });
      }
    }

    return { success: true, call_id, status: "ended" };
  } catch (error) {
    console.error("❌ Error ending call:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle decline call event
 * @param {Object} data - Decline call data
 * @param {string} data.call_id - Call ID
 * @param {string} data.user_id - User ID declining
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onDeclineCall(data, io, onlineUsers) {
  try {
    const { call_id, user_id } = data;

    console.log(`📞 Call ${call_id} declined by ${user_id}`);

    // Update call status
    const call = await Call.findByIdAndUpdate(
      call_id,
      {
        status: "declined",
        endedAt: new Date(),
        declinedBy: user_id,
      },
      { new: true }
    );

    if (!call) {
      throw new Error("Call not found");
    }

    // Get conversation participants
    const conversation = await Conversation.findById(call.conversationId);
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
        participantSocket.emit("callDeclined", {
          call_id,
          declined_by: user_id,
          status: "declined",
          timestamp: new Date(),
        });
      }
    }

    return { success: true, call_id, status: "declined" };
  } catch (error) {
    console.error("❌ Error declining call:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle update call status event
 * @param {Object} data - Update call status data
 * @param {string} data.call_id - Call ID
 * @param {string} data.user_id - User ID updating status
 * @param {string} data.status - New call status
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onUpdateCallStatus(data, io, onlineUsers) {
  try {
    const { call_id, user_id, status } = data;

    console.log(`📞 Call ${call_id} status updated to ${status} by ${user_id}`);

    // Update call status
    const call = await Call.findByIdAndUpdate(
      call_id,
      { status },
      { new: true }
    );

    if (!call) {
      throw new Error("Call not found");
    }

    // Get conversation participants
    const conversation = await Conversation.findById(call.conversationId);
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
        participantSocket.emit("callStatusUpdated", {
          call_id,
          status,
          updated_by: user_id,
          timestamp: new Date(),
        });
      }
    }

    return { success: true, call_id, status };
  } catch (error) {
    console.error("❌ Error updating call status:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle start group call event
 * @param {Object} data - Start group call data
 * @param {string} data.caller_id - ID of the caller
 * @param {string[]} data.participant_ids - Array of participant IDs
 * @param {string} data.conversation_id - Conversation ID
 * @param {string} data.call_type - Call type ('audio' or 'video')
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onStartGroupCall(data, io, onlineUsers) {
  try {
    const { caller_id, participant_ids, conversation_id, call_type } = data;

    console.log(
      `📞 Starting group ${call_type} call by ${caller_id} with ${participant_ids.length} participants`
    );

    // Validate required fields
    if (!caller_id || !participant_ids || !conversation_id || !call_type) {
      throw new Error("Missing required group call fields");
    }

    // Create group call in database
    const call = await Call.createCall({
      callerId: caller_id,
      recipientId: null, // Group call doesn't have single recipient
      conversationId: conversation_id,
      type: call_type,
      status: "ringing",
      isGroupCall: true,
      participants: participant_ids,
    });

    console.log(`✅ Group call created with ID: ${call._id}`);

    // Emit to all participants
    for (const participant_id of participant_ids) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        if (participant_id === caller_id) {
          // Emit to caller
          participantSocket.emit("groupCallStarted", {
            call_id: call._id,
            conversation_id,
            call_type,
            participant_ids,
            timestamp: new Date(),
          });
        } else {
          // Emit to participants
          participantSocket.emit("incomingGroupCall", {
            call_id: call._id,
            caller_id,
            call_type,
            conversation_id,
            participant_count: participant_ids.length,
            timestamp: new Date(),
          });
        }
      } else {
        // Create notification for offline participants
        await Notification.createNotification({
          recipientId: participant_id,
          senderId: caller_id,
          type: "call",
          title: `Incoming group ${call_type} call`,
          content: `You have an incoming group ${call_type} call`,
          data: {
            call_id: call._id,
            conversation_id,
            call_type,
            caller_id,
            is_group_call: true,
            participant_count: participant_ids.length,
          },
          deliveryMethod: "in_app",
        });
      }
    }

    return {
      success: true,
      call_id: call._id,
      status: "ringing",
      participant_count: participant_ids.length,
    };
  } catch (error) {
    console.error("❌ Error starting group call:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle join group call event
 * @param {Object} data - Join group call data
 * @param {string} data.call_id - Call ID
 * @param {string} data.user_id - User ID joining
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onJoinGroupCall(data, io, onlineUsers) {
  try {
    const { call_id, user_id } = data;

    console.log(`📞 User ${user_id} joining group call ${call_id}`);

    // Update call status and add participant
    const call = await Call.findByIdAndUpdate(
      call_id,
      {
        $addToSet: { participants: user_id },
        status: "active",
        startedAt: new Date(),
      },
      { new: true }
    );

    if (!call) {
      throw new Error("Group call not found");
    }

    // Emit to all participants
    for (const participant_id of call.participants) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id.toString()
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        participantSocket.emit("groupCallJoined", {
          call_id,
          user_id,
          participants: call.participants,
          participant_count: call.participants.length,
          timestamp: new Date(),
        });
      }
    }

    return {
      success: true,
      call_id,
      participants: call.participants,
      participant_count: call.participants.length,
    };
  } catch (error) {
    console.error("❌ Error joining group call:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle leave group call event
 * @param {Object} data - Leave group call data
 * @param {string} data.call_id - Call ID
 * @param {string} data.user_id - User ID leaving
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onLeaveGroupCall(data, io, onlineUsers) {
  try {
    const { call_id, user_id } = data;

    console.log(`📞 User ${user_id} leaving group call ${call_id}`);

    // Remove participant from call
    const call = await Call.findByIdAndUpdate(
      call_id,
      {
        $pull: { participants: user_id },
      },
      { new: true }
    );

    if (!call) {
      throw new Error("Group call not found");
    }

    // Check if call should end (no participants left)
    if (call.participants.length === 0) {
      await Call.findByIdAndUpdate(call_id, {
        status: "ended",
        endedAt: new Date(),
        endedBy: user_id,
      });
    }

    // Emit to remaining participants
    for (const participant_id of call.participants) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id.toString()
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        participantSocket.emit("groupCallLeft", {
          call_id,
          user_id,
          participants: call.participants,
          participant_count: call.participants.length,
          timestamp: new Date(),
        });
      }
    }

    return {
      success: true,
      call_id,
      participants: call.participants,
      participant_count: call.participants.length,
    };
  } catch (error) {
    console.error("❌ Error leaving group call:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle end group call event
 * @param {Object} data - End group call data
 * @param {string} data.call_id - Call ID
 * @param {string} data.user_id - User ID ending call
 * @param {number} data.duration - Call duration in seconds
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onEndGroupCall(data, io, onlineUsers) {
  try {
    const { call_id, user_id, duration = 0 } = data;

    console.log(
      `📞 Group call ${call_id} ended by ${user_id}, duration: ${duration}s`
    );

    // Update call status
    const call = await Call.findByIdAndUpdate(
      call_id,
      {
        status: "ended",
        endedAt: new Date(),
        duration: duration,
        endedBy: user_id,
      },
      { new: true }
    );

    if (!call) {
      throw new Error("Group call not found");
    }

    // Emit to all participants
    for (const participant_id of call.participants) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id.toString()
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        participantSocket.emit("groupCallEnded", {
          call_id,
          ended_by: user_id,
          duration,
          participant_count: call.participants.length,
          timestamp: new Date(),
        });
      }
    }

    return {
      success: true,
      call_id,
      status: "ended",
      duration,
      participant_count: call.participants.length,
    };
  } catch (error) {
    console.error("❌ Error ending group call:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle add to group call event
 * @param {Object} data - Add to group call data
 * @param {string} data.call_id - Call ID
 * @param {string} data.user_id - User ID being added
 * @param {string} data.added_by - User ID who is adding
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onAddToGroupCall(data, io, onlineUsers) {
  try {
    const { call_id, user_id, added_by } = data;

    console.log(
      `📞 User ${user_id} added to group call ${call_id} by ${added_by}`
    );

    // Add participant to call
    const call = await Call.findByIdAndUpdate(
      call_id,
      {
        $addToSet: { participants: user_id },
      },
      { new: true }
    );

    if (!call) {
      throw new Error("Group call not found");
    }

    // Emit to all participants
    for (const participant_id of call.participants) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id.toString()
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        participantSocket.emit("groupCallParticipantAdded", {
          call_id,
          user_id,
          added_by,
          participants: call.participants,
          participant_count: call.participants.length,
          timestamp: new Date(),
        });
      }
    }

    return {
      success: true,
      call_id,
      participants: call.participants,
      participant_count: call.participants.length,
    };
  } catch (error) {
    console.error("❌ Error adding to group call:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle remove from group call event
 * @param {Object} data - Remove from group call data
 * @param {string} data.call_id - Call ID
 * @param {string} data.user_id - User ID being removed
 * @param {string} data.removed_by - User ID who is removing
 * @param {Object} io - Socket.IO instance
 * @param {Array} onlineUsers - Array of online users
 */
export async function onRemoveFromGroupCall(data, io, onlineUsers) {
  try {
    const { call_id, user_id, removed_by } = data;

    console.log(
      `📞 User ${user_id} removed from group call ${call_id} by ${removed_by}`
    );

    // Remove participant from call
    const call = await Call.findByIdAndUpdate(
      call_id,
      {
        $pull: { participants: user_id },
      },
      { new: true }
    );

    if (!call) {
      throw new Error("Group call not found");
    }

    // Emit to all participants
    for (const participant_id of call.participants) {
      const participantUser = onlineUsers.find(
        (user) => user.userId === participant_id.toString()
      );
      const participantSocket = participantUser
        ? io.sockets.sockets.get(participantUser.socketId)
        : null;

      if (participantSocket) {
        participantSocket.emit("groupCallParticipantRemoved", {
          call_id,
          user_id,
          removed_by,
          participants: call.participants,
          participant_count: call.participants.length,
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
      removedSocket.emit("groupCallParticipantRemoved", {
        call_id,
        user_id,
        removed_by,
        timestamp: new Date(),
      });
    }

    return {
      success: true,
      call_id,
      participants: call.participants,
      participant_count: call.participants.length,
    };
  } catch (error) {
    console.error("❌ Error removing from group call:", error);
    return { success: false, error: error.message };
  }
}
