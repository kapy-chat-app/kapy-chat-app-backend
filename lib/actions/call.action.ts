/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/actions/call.actions.ts - UPDATED FOR REAL-TIME EMOTION
"use server";

import { connectToDatabase } from "@/lib/mongoose";
import Call from "@/database/call.model";
import Conversation from "@/database/conversation.model";
import User from "@/database/user.model";
import EmotionAnalysis from "@/database/emotion-analysis.model";
import { emitSocketEvent, emitToUserRoom } from "@/lib/socket.helper";
import { clerkClient } from "@clerk/nextjs/server";
import PushToken from "@/database/push-token.model";
import { sendCallNotification as sendFCMCallNotification, isValidFCMToken } from '../services/fcm.service';
import { sendCallNotification as sendExpoCallNotification } from '../pushNotification';
import Message from "@/database/message.model";

/**
 * ⭐ UPDATED: Create call log message with different statuses
 */
async function createCallLogMessage(params: {
  conversationId: string;
  callId: string;
  callerId: string;
  type: "audio" | "video";
  status: "ongoing" | "ended" | "rejected" | "missed";
  duration?: number;
  participants?: string[];
}) {
  try {
    console.log("🔔 ========== CREATE CALL LOG MESSAGE ==========");
    console.log("📋 Params:", params);

    const { conversationId, callId, callerId, type, status, duration, participants } = params;

    await connectToDatabase();

    const caller = await User.findOne({ clerkId: callerId });
    if (!caller) {
      console.error("❌ Caller not found:", callerId);
      throw new Error("Caller not found");
    }
    console.log("✅ Caller found:", { id: caller._id, name: caller.full_name });

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      console.error("❌ Conversation not found:", conversationId);
      throw new Error("Conversation not found");
    }
    console.log("✅ Conversation found:", { 
      id: conversation._id, 
      type: conversation.type,
      name: conversation.name 
    });

    const isGroup = conversation.type === "group";
    console.log("🔍 Is group call:", isGroup);

    // ⭐ CASE 1: Group call
    if (isGroup) {
      console.log("📱 Processing GROUP CALL message");

      let content = "";
      let metadata: any = {
        isSystemMessage: true,
        action: "call_log",
        call_id: callId,
        call_type: type,
        caller_id: callerId,
        caller_name: caller.full_name,
        participants: participants || [],
      };

      if (status === "ongoing") {
        content = `📞 ${caller.full_name} started a ${type} call`;
        metadata.call_status = "ongoing";
      } else if (status === "rejected") {
        content = `📞 Group call was declined`;
        metadata.call_status = "rejected";
      } else if (status === "missed") {
        content = `📞 Missed group call from ${caller.full_name}`;
        metadata.call_status = "missed";
      } else {
        // ended
        const durationText = duration && duration > 0
          ? duration < 60
            ? `${duration} seconds`
            : `${Math.floor(duration / 60)} minutes ${duration % 60} seconds`
          : "Less than a second";

        content = `📞 Group call ended - Duration: ${durationText}`;
        metadata.call_status = "ended";
        metadata.duration = duration || 0;
      }

      console.log("📝 Creating group call message:", content);

      if (status === "ongoing") {
        // Create new message
        const message = await Message.create({
          conversation: conversationId,
          sender: caller._id,
          content,
          type: "text",
          metadata,
        });

        console.log("✅ Message CREATED:", message._id);

        await emitSocketEvent(
          "newMessage",
          conversationId,
          {
            message_id: message._id.toString(),
            conversation_id: conversationId,
            sender_id: callerId,
            sender_name: caller.full_name,
            message_content: content,
            message_type: "text",
            message: {
              _id: message._id.toString(),
              conversation: conversationId,
              sender: {
                clerkId: callerId,
                full_name: caller.full_name,
                username: caller.username,
                avatar: (caller.avatar as any)?.url,
              },
              content,
              type: "text",
              metadata,
              attachments: [],
              reactions: [],
              is_edited: false,
              read_by: [],
              created_at: new Date(),
              updated_at: new Date(),
            },
          },
          true
        );

        console.log("✅ newMessage emitted");
        return message._id.toString();
      } else {
        // Update existing message or create new one
        const existingMessage = await Message.findOne({
          conversation: conversationId,
          "metadata.call_id": callId,
          "metadata.call_status": "ongoing",
        });

        if (existingMessage) {
          console.log("✅ Updating existing message");
          
          existingMessage.content = content;
          existingMessage.metadata = metadata;
          await existingMessage.save();

          await emitSocketEvent("updateMessage", conversationId, {
            message_id: existingMessage._id.toString(),
            user_id: callerId,
            new_content: content,
            metadata,
            edited_at: new Date(),
          });

          return existingMessage._id.toString();
        } else {
          console.log("✅ Creating new message");
          
          const message = await Message.create({
            conversation: conversationId,
            sender: caller._id,
            content,
            type: "text",
            metadata,
          });

          await emitSocketEvent(
            "newMessage",
            conversationId,
            {
              message_id: message._id.toString(),
              conversation_id: conversationId,
              sender_id: callerId,
              sender_name: caller.full_name,
              message_content: content,
              message_type: "text",
              message: {
                _id: message._id.toString(),
                conversation: conversationId,
                sender: {
                  clerkId: callerId,
                  full_name: caller.full_name,
                  username: caller.username,
                  avatar: (caller.avatar as any)?.url,
                },
                content,
                type: "text",
                metadata,
                attachments: [],
                reactions: [],
                is_edited: false,
                read_by: [],
                created_at: new Date(),
                updated_at: new Date(),
              },
            },
            true
          );

          return message._id.toString();
        }
      }
    } else {
      // ⭐ CASE 2: Private call
      console.log("📱 Processing PRIVATE CALL message");
      
      let content = "";
      const callTypeText = type === "video" ? "Video" : "Audio";
      
      if (status === "rejected") {
        content = `📞 ${callTypeText} call was declined`;
      } else if (status === "missed") {
        content = `📞 Missed ${callTypeText.toLowerCase()} call`;
      } else {
        // ended
        const durationText = duration && duration > 0
          ? duration < 60
            ? `${duration} seconds`
            : `${Math.floor(duration / 60)} minutes ${duration % 60} seconds`
          : "Less than a second";

        content = `📞 ${callTypeText} call ended - Duration: ${durationText}`;
      }

      const metadata = {
        isSystemMessage: true,
        action: "call_log",
        call_id: callId,
        call_type: type,
        call_status: status,
        caller_id: callerId,
        caller_name: caller.full_name,
        duration: duration || 0,
      };

      console.log("📝 Creating private call message:", content);

      const message = await Message.create({
        conversation: conversationId,
        sender: caller._id,
        content,
        type: "text",
        metadata,
      });

      console.log("✅ Message CREATED:", message._id);

      await emitSocketEvent(
        "newMessage",
        conversationId,
        {
          message_id: message._id.toString(),
          conversation_id: conversationId,
          sender_id: callerId,
          sender_name: caller.full_name,
          message_content: content,
          message_type: "text",
          message: {
            _id: message._id.toString(),
            conversation: conversationId,
            sender: {
              clerkId: callerId,
              full_name: caller.full_name,
              username: caller.username,
              avatar: (caller.avatar as any)?.url,
            },
            content,
            type: "text",
            metadata,
            attachments: [],
            reactions: [],
            is_edited: false,
            read_by: [],
            created_at: new Date(),
            updated_at: new Date(),
          },
        },
        true
      );

      console.log("✅ newMessage emitted");
      return message._id.toString();
    }

    console.log("🔔 ========== CREATE CALL LOG MESSAGE COMPLETED ==========");
    return null;
  } catch (error) {
    console.error("❌ ========== CREATE CALL LOG MESSAGE FAILED ==========");
    console.error("❌ Error:", error);
    return null;
  }
}

/**
 * ⚡ Async notification sender (non-blocking)
 */
async function sendCallNotificationsAsync(params: {
  otherParticipants: any[];
  callData: any;
}) {
  const { otherParticipants, callData } = params;

  try {
    for (const participant of otherParticipants) {
      if (!participant.clerkId) continue;

      const participantUser = await User.findOne({
        clerkId: participant.clerkId,
      });

      if (!participantUser) {
        console.log(`⚠️ User not found: ${participant.clerkId}`);
        continue;
      }

      const pushTokenDoc = await PushToken.findOne({
        user: participantUser._id,
        is_active: true,
      }).sort({ last_used: -1 });

      if (!pushTokenDoc?.token) {
        console.log(`⚠️ No push token for user: ${participant.clerkId}`);
        continue;
      }

      const token = pushTokenDoc.token;
      let ticket;

      if (isValidFCMToken(token)) {
        console.log(`📱 Sending FCM notification to ${participant.clerkId}`);
        ticket = await sendFCMCallNotification({
          fcmToken: token,
          ...callData,
        });
      } else {
        console.log(`📱 Sending Expo notification to ${participant.clerkId}`);
        ticket = await sendExpoCallNotification({
          pushToken: token,
          ...callData,
        });
      }

      if (ticket?.status === "ok") {
        console.log(`✅ Notification delivered to ${participant.clerkId}`);
      }
    }
  } catch (error) {
    console.error("⚠️ Notification batch error:", error);
    // Don't throw - this runs async
  }
}

/**
 * Initiate a new call - WITH FCM SUPPORT
 */
export async function initiateCall(params: {
  userId: string;
  conversationId: string;
  type: "audio" | "video";
}) {
  try {
    const { userId, conversationId, type } = params;

    await connectToDatabase();

    const callerUser = await User.findOne({ clerkId: userId }).populate("avatar");
    if (!callerUser) {
      throw new Error("User not found in database");
    }

    const conversation = await Conversation.findById(conversationId)
      .populate({
        path: "participants",
        select: "clerkId full_name username avatar _id",
        populate: {
          path: "avatar",
          select: "url publicId"
        }
      })
      .populate({
        path: "avatar",
        select: "url publicId"
      });

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    if (!conversation.participants || conversation.participants.length === 0) {
      throw new Error("Conversation has no participants");
    }

    if (
      conversation.type === "private" &&
      conversation.participants.length !== 2
    ) {
      throw new Error("Personal calls must have exactly 2 participants");
    }

    const clerk = await clerkClient();
    const clerkCaller = await clerk.users.getUser(userId);

    const channelName = `call_${conversationId}_${Date.now()}`;

    const participants = conversation.participants.map((p: any) => ({
      user: p._id,
      joinedAt: new Date(),
    }));

    const call = await Call.create({
      conversation: conversationId,
      caller: callerUser._id,
      type,
      channelName,
      status: "ringing",
      startedAt: new Date(),
      participants: participants,
    });

    console.log(`📞 Call initiated: ${call._id} by ${callerUser._id}`);

    // Create "Call in progress" message for GROUP calls
    if (conversation.type === "group") {
      await createCallLogMessage({
        conversationId,
        callId: call._id.toString(),
        callerId: userId,
        type,
        status: "ongoing",
        participants: participants.map(p => p.user.toString()),
      });
    }

    const otherParticipants = conversation.participants.filter(
      (p: any) => p.clerkId !== userId
    );

    const callerName = callerUser.full_name || 
                       `${clerkCaller.firstName || ""} ${clerkCaller.lastName || ""}`.trim() || 
                       callerUser.username || 
                       "Unknown User";
    
    const callerAvatar = (callerUser.avatar as any)?.url || 
                         clerkCaller.imageUrl || 
                         "";

    let displayName = "";
    let displayAvatar = "";

    if (conversation.type === "private") {
      displayName = callerName;
      displayAvatar = callerAvatar;
    } else {
      displayName = conversation.name || "Group Call";
      if (conversation.avatar && typeof conversation.avatar === "object") {
        displayAvatar = (conversation.avatar as any).url || "";
      }
    }

    const callData = {
      call_id: call._id.toString(),
      caller_id: userId,
      caller_name: callerName,
      caller_avatar: callerAvatar,
      call_type: type,
      conversation_id: conversationId,
      channel_name: channelName,
      conversation_type: conversation.type,
      display_name: displayName,
      display_avatar: displayAvatar,
    };

    // Emit socket event (for app already running)
    for (const participant of otherParticipants) {
      if (!participant.clerkId) continue;
      await emitToUserRoom("incomingCall", participant.clerkId, callData);
    }

    // ⭐ UPDATED: Send push notifications with FCM/Expo detection
    sendCallNotificationsAsync({
      otherParticipants,
      callData: {
        callerName: displayName,
        callType: type,
        callId: call._id.toString(),
        channelName,
        conversationId,
        callerId: userId,
        callerAvatar: displayAvatar,
        conversationType: conversation.type,
        conversationName: conversation.name || displayName,
        conversationAvatar: displayAvatar,
        participantsCount: call.participants.length - 1,
      },
    }).catch(err => console.error("⚠️ Async notification error:", err));

    return {
      success: true,
      call: {
        id: call._id.toString(),
        channelName,
        type,
        status: call.status,
        conversationId,
      },
      caller: {
        id: userId,
        name: callerName,
        avatar: callerAvatar,
      },
    };
  } catch (error: any) {
    console.error("❌ Error initiating call:", error);
    throw new Error(error.message || "Failed to initiate call");
  }
}



/**
 * Answer a call
 */
export async function answerCall(params: { userId: string; callId: string }) {
  try {
    const { userId, callId } = params;

    await connectToDatabase();

    const mongoUser = await User.findOne({ clerkId: userId });
    if (!mongoUser) {
      throw new Error("User not found in database");
    }

    const call = await Call.findById(callId).populate({
      path: "conversation",
      populate: {
        path: "participants",
        select: "clerkId full_name avatar _id",
      },
    });

    if (!call) {
      throw new Error("Call not found");
    }

    if (call.status !== "ringing" && call.status !== "ongoing") {
      throw new Error(`Call has ${call.status}`);
    }

    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);

    const userAlreadyInCall = call.participants.some(
      (p: any) => p.user.toString() === mongoUser._id.toString()
    );

    if (userAlreadyInCall) {
      console.log(`📞 User ${userId} already in call`);
      return {
        success: true,
        channelName: call.channelName,
        callId: call._id.toString(),
        status: call.status,
        message: "Already in call",
      };
    }

    call.participants.push({
      user: mongoUser._id,
      joinedAt: new Date(),
    });

    if (call.status === "ringing") {
      call.status = "ongoing";
    }

    await call.save();

    const callAnsweredData = {
      call_id: call._id.toString(),
      answered_by: userId,
      answered_by_name: clerkUser.firstName + " " + clerkUser.lastName,
      answered_by_avatar: clerkUser.imageUrl,
      channel_name: call.channelName,
      status: call.status,
      total_participants: call.participants.length,
    };

    const conversation = call.conversation as any;
    if (conversation && conversation.participants) {
      for (const participant of conversation.participants) {
        if (participant.clerkId === userId) continue;
        await emitToUserRoom(
          "callAnswered",
          participant.clerkId,
          callAnsweredData
        );
      }
    }

    return {
      success: true,
      channelName: call.channelName,
      callId: call._id.toString(),
      status: call.status,
      totalParticipants: call.participants.length,
    };
  } catch (error: any) {
    console.error("❌ Error answering call:", error);
    throw new Error(error.message || "Failed to answer call");
  }
}

/**
 * Reject a call
 */
export async function rejectCall(params: { userId: string; callId: string }) {
  try {
    const { userId, callId } = params;

    await connectToDatabase();

    const mongoUser = await User.findOne({ clerkId: userId });
    if (!mongoUser) {
      throw new Error("User not found in database");
    }

    const call = await Call.findById(callId).populate({
      path: "conversation",
      populate: {
        path: "participants",
        select: "clerkId full_name avatar _id",
      },
    });

    if (!call) {
      throw new Error("Call not found");
    }

    const conversation = call.conversation as any;
    const isGroupCall = conversation.type === "group";

    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);

    if (isGroupCall) {
      if (call.status !== "ringing" && call.status !== "ongoing") {
        throw new Error(`Call has already ${call.status}`);
      }

      const callRejectedData = {
        call_id: call._id.toString(),
        rejected_by: userId,
        rejected_by_name: clerkUser.firstName + " " + clerkUser.lastName,
        rejected_by_avatar: clerkUser.imageUrl,
        status: call.status,
        rejection_type: "personal",
      };

      await emitToUserRoom("callRejected", userId, callRejectedData);

      return {
        success: true,
        status: call.status,
        callId: call._id.toString(),
        message: "You rejected the call, but it continues for others",
      };
    } else {
      if (call.status !== "ringing") {
        throw new Error(`Call is already ${call.status}`);
      }

      call.status = "rejected";
      call.endedAt = new Date();
      call.endedBy = mongoUser._id;
      await call.save();

      const callRejectedData = {
        call_id: call._id.toString(),
        rejected_by: userId,
        rejected_by_name: clerkUser.firstName + " " + clerkUser.lastName,
        rejected_by_avatar: clerkUser.imageUrl,
        status: "rejected",
        rejection_type: "full",
      };

      if (conversation && conversation.participants) {
        for (const participant of conversation.participants) {
          await emitToUserRoom(
            "callRejected",
            participant.clerkId,
            callRejectedData
          );
        }
      }

      return {
        success: true,
        status: "rejected",
        callId: call._id.toString(),
      };
    }
  } catch (error: any) {
    console.error("❌ Error rejecting call:", error);
    throw new Error(error.message || "Failed to reject call");
  }
}

/**
 * ⭐ UPDATED: End a call - NO MORE requestCallRecording
 */
export async function endCall(params: {
  userId: string;
  callId: string;
  duration?: number;
}) {
  try {
    console.log("🔔 ========== END CALL STARTED ==========");
    console.log("📋 Params:", params);

    const { userId, callId, duration } = params;

    await connectToDatabase();
    const mongoUser = await User.findOne({ clerkId: userId });
    if (!mongoUser) {
      throw new Error("User not found in database");
    }

    const call = await Call.findById(callId).populate({
      path: "conversation",
      populate: {
        path: "participants",
        select: "clerkId full_name avatar _id",
      },
    });

    if (!call) {
      throw new Error("Call not found");
    }

    console.log("✅ Call found:", {
      callId: call._id,
      status: call.status,
      callerId: call.caller,
      currentUserId: mongoUser._id,
      isCaller: call.caller.toString() === mongoUser._id.toString(),
    });

    const isCaller = call.caller.toString() === mongoUser._id.toString();
    const conversation = call.conversation as any;
    
    // ⭐ Check if message already exists
    const existingCallLogMessage = await Message.findOne({
      conversation: conversation._id,
      "metadata.call_id": callId,
      "metadata.action": "call_log",
    });

    console.log("🔍 Existing message:", existingCallLogMessage ? "FOUND" : "NOT FOUND");

    // ⭐ Determine call outcome based on CURRENT status
    let callOutcome: "ended" | "rejected" | "missed" = "ended";
    let previousStatus = call.status;
    
    if (call.status === "rejected") {
      callOutcome = "rejected";
    } else if (call.status === "ringing") {
      callOutcome = "missed";
    } else if (call.status === "ongoing") {
      callOutcome = "ended";
    } else if (call.status === "ended" || call.status === "missed") {
      // Already ended/missed, determine outcome from stored data
      callOutcome = call.status === "missed" ? "missed" : "ended";
    }

    console.log("📊 Call outcome:", callOutcome, "Previous status:", previousStatus);

    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);

    let callDuration = duration || call.duration;
    if (!callDuration && call.startedAt) {
      const endTime = call.endedAt || new Date();
      const startTime = new Date(call.startedAt);
      callDuration = Math.floor(
        (endTime.getTime() - startTime.getTime()) / 1000
      );
    }
    console.log("⏱️ Call duration:", callDuration);

    // ⭐ Update call status if not already finalized
    if (call.status !== "ended" && call.status !== "rejected" && call.status !== "missed") {
      call.status = callOutcome === "missed" ? "missed" : callOutcome === "rejected" ? "rejected" : "ended";
      call.endedAt = new Date();
      call.endedBy = mongoUser._id;
      if (callDuration) {
        call.duration = callDuration;
      }
      await call.save();
      console.log(`✅ Call status updated to '${call.status}'`);
    } else {
      console.log(`ℹ️ Call already in final state: ${call.status}`);
    }

    // ⭐ CRITICAL FIX: Caller creates message if it doesn't exist
    if (isCaller && !existingCallLogMessage) {
      console.log(`📝 Creating call log message (caller, outcome: ${callOutcome})...`);

      const messageId = await createCallLogMessage({
        conversationId: conversation._id.toString(),
        callId: call._id.toString(),
        callerId: userId,
        type: call.type,
        status: callOutcome,
        duration: callDuration,
        participants: call.participants.map((p: any) => p.user.toString()),
      });

      console.log("✅ Call log message created:", messageId);
    } else if (!isCaller) {
      console.log("ℹ️ User is not caller, skipping message creation");
    } else if (existingCallLogMessage) {
      console.log("ℹ️ Message already exists, skipping creation");
    }

    const callEndedData = {
      call_id: call._id.toString(),
      ended_by: userId,
      ended_by_name: clerkUser.firstName + " " + clerkUser.lastName,
      ended_by_avatar: clerkUser.imageUrl,
      duration: callDuration || 0,
      status: call.status,
    };

    if (conversation && conversation.participants) {
      console.log(`📤 Emitting callEnded to ${conversation.participants.length} participants`);
      for (const participant of conversation.participants) {
        await emitToUserRoom("callEnded", participant.clerkId, callEndedData);
      }
    }

    // ❌ REMOVED: requestCallRecording emission
    // Real-time emotion analysis handles this during the call

    console.log("🔔 ========== END CALL COMPLETED ==========");
    return {
      success: true,
      duration: call.duration || callDuration || 0,
      status: call.status,
      callId: call._id.toString(),
    };
  } catch (error: any) {
    console.error("❌ Error ending call:", error);
    throw new Error(error.message || "Failed to end call");
  }
}

/**
 * ⭐ UPDATED: Get emotion analysis for a call - Real-time data
 */
export async function getCallEmotionAnalysis(params: {
  callId: string;
  userId?: string;
}) {
  try {
    const { callId, userId } = params;

    await connectToDatabase();

    const call = await Call.findById(callId);
    if (!call) {
      throw new Error("Call not found");
    }

    // Build query for EmotionAnalysis
    const query: any = {
      conversation: call.conversation,
      context: "call",
      analyzed_at: {
        $gte: call.startedAt,
        $lte: call.endedAt || new Date(),
      },
    };

    // If userId provided, filter by user
    if (userId) {
      const mongoUser = await User.findOne({ clerkId: userId });
      if (mongoUser) {
        query.user = mongoUser._id;
      }
    }

    // Get emotion analyses (real-time captured)
    const analyses = await EmotionAnalysis.find(query)
      .populate("user", "clerkId full_name username avatar")
      .sort({ analyzed_at: -1 });

    return {
      success: true,
      data: analyses.map((a) => a.toObject()),
    };
  } catch (error: any) {
    console.error("❌ Error getting call emotion analysis:", error);
    return {
      success: false,
      error: error.message || "Failed to get emotion analysis",
    };
  }
}