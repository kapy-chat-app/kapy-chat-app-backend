/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/actions/call.actions.ts (ENHANCED VERSION)
"use server";

import { connectToDatabase } from "@/lib/mongoose";
import Call from "@/database/call.model";
import Conversation from "@/database/conversation.model";
import User from "@/database/user.model";
import EmotionAnalysis from "@/database/emotion-analysis.model";
import { emitToUserRoom } from "@/lib/socket.helper";
import { clerkClient } from "@clerk/nextjs/server";
import HuggingFaceService from "@/lib/services/huggingface.service";
import { uploadFileToCloudinary } from "./file.action";

/**
 * Initiate a new call
 */
export async function initiateCall(params: {
  userId: string;
  conversationId: string;
  type: "audio" | "video";
}) {
  try {
    const { userId, conversationId, type } = params;

    await connectToDatabase();

    // Find caller in database
    const callerUser = await User.findOne({ clerkId: userId });
    if (!callerUser) {
      throw new Error("User not found in database");
    }

    // Find conversation
    const conversation = await Conversation.findById(conversationId).populate(
      "participants",
      "clerkId full_name avatar _id"
    );

    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Validate personal call participants
    if (conversation.type === "private" && conversation.participants.length !== 2) {
      throw new Error("Personal calls must have exactly 2 participants");
    }

    // Get caller info from Clerk
    const clerk = await clerkClient();
    const caller = await clerk.users.getUser(userId);

    // Generate channel name
    const channelName = `call_${conversationId}_${Date.now()}`;

    // Prepare participants
    const participants = conversation.participants.map((p: any) => ({
      user: p._id,
      joinedAt: new Date(),
    }));

    // Create call
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
    console.log(`👥 Total participants:`, participants.length);

    // Filter out caller from notification recipients
    const otherParticipants = conversation.participants.filter(
      (p: any) => p.clerkId !== userId
    );

    console.log(
      `📤 Sending incoming call to ${otherParticipants.length} participants (excluding caller)`
    );

    // Prepare call data for notification
    const callData = {
      call_id: call._id.toString(),
      caller_id: userId,
      caller_name: caller.firstName + " " + caller.lastName,
      caller_avatar: caller.imageUrl,
      call_type: type,
      conversation_id: conversationId,
      channel_name: channelName,
    };

    // Emit incoming call to each participant
    for (const participant of otherParticipants) {
      console.log(`📞 Emitting incomingCall to user room: user:${participant.clerkId}`);
      await emitToUserRoom("incomingCall", participant.clerkId, callData);
    }

    console.log(`✅ Incoming call sent to ${otherParticipants.length} participants`);

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
        name: caller.firstName + " " + caller.lastName,
        avatar: caller.imageUrl,
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

    // Find MongoDB User from clerkId
    const mongoUser = await User.findOne({ clerkId: userId });
    if (!mongoUser) {
      throw new Error("User not found in database");
    }

    // Find call and populate conversation
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

    // Allow joining if call is ringing OR ongoing (for group calls)
    if (call.status !== "ringing" && call.status !== "ongoing") {
      throw new Error(`Call has ${call.status}`);
    }

    // Get user info from Clerk
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);

    // Check if user already in call
    const userAlreadyInCall = call.participants.some(
      (p: any) => p.user.toString() === mongoUser._id.toString()
    );

    if (userAlreadyInCall) {
      console.log(`📞 User ${userId} already in call, returning existing data`);
      return {
        success: true,
        channelName: call.channelName,
        callId: call._id.toString(),
        status: call.status,
        message: "Already in call",
      };
    }

    // Add user to participants
    call.participants.push({
      user: mongoUser._id,
      joinedAt: new Date(),
    });

    // Update status to "ongoing" only if currently "ringing"
    if (call.status === "ringing") {
      call.status = "ongoing";
    }

    await call.save();

    console.log(
      `📞 User joined call: ${call._id} - User: ${userId} (MongoDB: ${mongoUser._id})`
    );
    console.log(`👥 Total participants in call: ${call.participants.length}`);

    // Prepare call answered data
    const callAnsweredData = {
      call_id: call._id.toString(),
      answered_by: userId,
      answered_by_name: clerkUser.firstName + " " + clerkUser.lastName,
      answered_by_avatar: clerkUser.imageUrl,
      channel_name: call.channelName,
      status: call.status,
      total_participants: call.participants.length,
    };

    // Emit callAnswered to all participants (except the one who answered)
    const conversation = call.conversation as any;
    if (conversation && conversation.participants) {
      console.log(
        `📤 Emitting callAnswered to ${conversation.participants.length} conversation members`
      );

      for (const participant of conversation.participants) {
        // Skip the person who just answered
        if (participant.clerkId === userId) continue;

        console.log(`📞 Sending callAnswered to user: ${participant.clerkId}`);
        await emitToUserRoom("callAnswered", participant.clerkId, callAnsweredData);
      }
    }

    console.log(`✅ User joined call successfully, notification sent to all participants`);

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

    // Find MongoDB User from clerkId
    const mongoUser = await User.findOne({ clerkId: userId });
    if (!mongoUser) {
      throw new Error("User not found in database");
    }

    // Find call and populate conversation
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

    // Get conversation info
    const conversation = call.conversation as any;
    const isGroupCall = conversation.type === "group";

    // Get user info from Clerk
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);

    if (isGroupCall) {
      // GROUP CALL: Only reject for self, don't end call for others
      if (call.status !== "ringing" && call.status !== "ongoing") {
        throw new Error(`Call has already ${call.status}`);
      }

      console.log(`📞 User ${userId} rejected group call: ${call._id}`);

      // Only notify this user that they rejected
      const callRejectedData = {
        call_id: call._id.toString(),
        rejected_by: userId,
        rejected_by_name: clerkUser.firstName + " " + clerkUser.lastName,
        rejected_by_avatar: clerkUser.imageUrl,
        status: call.status,
        rejection_type: "personal",
      };

      // Only emit to this user to hide incoming call dialog
      await emitToUserRoom("callRejected", userId, callRejectedData);

      console.log(`✅ User ${userId} rejected group call notification sent`);

      return {
        success: true,
        status: call.status,
        callId: call._id.toString(),
        message: "You rejected the call, but it continues for others",
      };
    } else {
      // PERSONAL CALL: Reject will end call for everyone
      if (call.status !== "ringing") {
        throw new Error(`Call is already ${call.status}`);
      }

      // Update call status
      call.status = "rejected";
      call.endedAt = new Date();
      call.endedBy = mongoUser._id;
      await call.save();

      console.log(`📞 Personal call rejected: ${call._id} by ${userId}`);

      // Prepare call rejected data
      const callRejectedData = {
        call_id: call._id.toString(),
        rejected_by: userId,
        rejected_by_name: clerkUser.firstName + " " + clerkUser.lastName,
        rejected_by_avatar: clerkUser.imageUrl,
        status: "rejected",
        rejection_type: "full",
      };

      // Emit callRejected to all participants
      if (conversation && conversation.participants) {
        console.log(
          `📤 Emitting callRejected to ${conversation.participants.length} participants`
        );

        for (const participant of conversation.participants) {
          console.log(`📞 Sending callRejected to user: ${participant.clerkId}`);
          await emitToUserRoom("callRejected", participant.clerkId, callRejectedData);
        }
      }

      console.log(`✅ Personal call rejected notification sent to all participants`);

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
 * End a call (ENHANCED WITH EMOTION ANALYSIS TRIGGER)
 */
export async function endCall(params: {
  userId: string;
  callId: string;
  duration?: number;
}) {
  try {
    const { userId, callId, duration } = params;

    await connectToDatabase();

    // Find MongoDB User from clerkId
    const mongoUser = await User.findOne({ clerkId: userId });
    if (!mongoUser) {
      throw new Error("User not found in database");
    }

    // Find call and populate conversation
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

    // Check if call is already ended
    if (call.status === "ended") {
      return {
        success: true,
        message: "Call already ended",
        duration: call.duration || 0,
      };
    }

    // Get user info from Clerk
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);

    // Calculate duration if not provided
    let callDuration = duration;
    if (!callDuration && call.startedAt) {
      const endTime = new Date();
      const startTime = new Date(call.startedAt);
      callDuration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
    }

    // Update call status
    call.status = "ended";
    call.endedAt = new Date();
    call.endedBy = mongoUser._id;
    if (callDuration) {
      call.duration = callDuration;
    }
    await call.save();

    console.log(
      `📞 Call ended: ${call._id} by ${userId} (MongoDB: ${mongoUser._id}), duration: ${callDuration}s`
    );

    // Prepare call ended data
    const callEndedData = {
      call_id: call._id.toString(),
      ended_by: userId,
      ended_by_name: clerkUser.firstName + " " + clerkUser.lastName,
      ended_by_avatar: clerkUser.imageUrl,
      duration: callDuration || 0,
      status: "ended",
    };

    // Emit callEnded to all participants
    const conversation = call.conversation as any;
    if (conversation && conversation.participants) {
      console.log(
        `📤 Emitting callEnded to ${conversation.participants.length} participants`
      );

      for (const participant of conversation.participants) {
        console.log(`📞 Sending callEnded to user: ${participant.clerkId}`);
        await emitToUserRoom("callEnded", participant.clerkId, callEndedData);
      }
    }

    console.log(`✅ Call ended notification sent to all participants`);

    // ⭐ NEW: Notify participants to upload recordings for emotion analysis
    if (conversation && conversation.participants) {
      console.log(`🎯 Requesting emotion analysis recordings from participants...`);
      
      for (const participant of conversation.participants) {
        await emitToUserRoom("requestCallRecording", participant.clerkId, {
          call_id: call._id.toString(),
          conversation_id: conversation._id.toString(),
          call_type: call.type,
          duration: callDuration || 0,
        });
      }
    }

    return {
      success: true,
      duration: call.duration || 0,
      status: "ended",
      callId: call._id.toString(),
    };
  } catch (error: any) {
    console.error("❌ Error ending call:", error);
    throw new Error(error.message || "Failed to end call");
  }
}

export async function processCallRecording(params: {
  userId: string;
  callId: string;
  audioBuffer?: Buffer;
  videoFrameBuffer?: Buffer;
  recordingDuration?: number;
}) {
  try {
    const { userId, callId, audioBuffer, videoFrameBuffer, recordingDuration } = params;

    await connectToDatabase();

    // Find MongoDB User from clerkId
    const mongoUser = await User.findOne({ clerkId: userId });
    if (!mongoUser) {
      throw new Error("User not found in database");
    }

    // Find call
    const call = await Call.findById(callId).populate("conversation");
    if (!call) {
      throw new Error("Call not found");
    }

    console.log(`🎬 Processing call recording for user ${userId}, call ${callId}`);

    // ⭐ STEP 1: Upload to Cloudinary
    let audioUrl: string | undefined;
    let videoUrl: string | undefined;

    if (audioBuffer) {
      console.log(`📤 Uploading audio to Cloudinary...`);
      
      // Convert Buffer to File
      const audioFile = new File(
        [audioBuffer],
        `call_audio_${callId}_${userId}_${Date.now()}.wav`,
        { type: "audio/wav" }
      );

      const audioUploadResult = await uploadFileToCloudinary(
        audioFile,
        "call_recordings/audio",
        userId
      );

      if (audioUploadResult.success && audioUploadResult.file) {
        audioUrl = audioUploadResult.file.url;
        console.log(`✅ Audio uploaded to Cloudinary: ${audioUrl}`);
      } else {
        console.error(`❌ Audio upload failed:`, audioUploadResult.error);
        throw new Error(audioUploadResult.error || "Audio upload failed");
      }
    }

    if (videoFrameBuffer) {
      console.log(`📤 Uploading video frame to Cloudinary...`);
      
      const videoFile = new File(
        [videoFrameBuffer],
        `call_frame_${callId}_${userId}_${Date.now()}.jpg`,
        { type: "image/jpeg" }
      );

      const videoUploadResult = await uploadFileToCloudinary(
        videoFile,
        "call_recordings/frames",
        userId
      );

      if (videoUploadResult.success && videoUploadResult.file) {
        videoUrl = videoUploadResult.file.url;
        console.log(`✅ Video frame uploaded to Cloudinary: ${videoUrl}`);
      } else {
        console.warn(`⚠️ Video upload failed (optional):`, videoUploadResult.error);
        // Video is optional, don't throw
      }
    }

    // ⭐ STEP 2: Update Call model with Cloudinary URLs
    const callUpdateData: any = {
      recording_uploaded_at: new Date(),
    };

    if (audioUrl) {
      callUpdateData.recording_audio_url = audioUrl;
    }
    if (videoUrl) {
      callUpdateData.recording_video_url = videoUrl;
    }
    if (recordingDuration) {
      callUpdateData.recording_duration = recordingDuration;
    }

    await Call.findByIdAndUpdate(callId, { $set: callUpdateData });
    console.log(`💾 Call updated with Cloudinary URLs`);

    // ⭐ STEP 3: Analyze emotion using HuggingFace
    let emotionResult: any = null;
    let audioFeatures: any = undefined;

    // Analyze based on available data
    if (audioBuffer && videoFrameBuffer) {
      // Both audio and video available - combine analysis
      console.log(`🎭 Analyzing both audio and video emotion...`);
      
      const audioResult = await HuggingFaceService.analyzeAudioEmotion(audioBuffer);
      const videoResult = await HuggingFaceService.analyzeVideoEmotion(videoFrameBuffer);
      
      emotionResult = HuggingFaceService.combineEmotionAnalysis(audioResult, videoResult);
      audioFeatures = audioResult.audioFeatures;
      
      console.log(`✅ Combined emotion: ${emotionResult.emotion} (${(emotionResult.score * 100).toFixed(0)}%)`);
    } else if (audioBuffer) {
      // Audio only
      console.log(`🎤 Analyzing audio emotion only...`);
      
      const audioResult = await HuggingFaceService.analyzeAudioEmotion(audioBuffer);
      emotionResult = audioResult;
      audioFeatures = audioResult.audioFeatures;
      
      console.log(`✅ Audio emotion: ${emotionResult.emotion} (${(emotionResult.score * 100).toFixed(0)}%)`);
    } else if (videoFrameBuffer) {
      // Video only
      console.log(`📹 Analyzing video emotion only...`);
      
      emotionResult = await HuggingFaceService.analyzeVideoEmotion(videoFrameBuffer);
      
      console.log(`✅ Video emotion: ${emotionResult.emotion} (${(emotionResult.score * 100).toFixed(0)}%)`);
    } else {
      throw new Error("No audio or video data provided for analysis");
    }

    // ⭐ STEP 4: Create EmotionAnalysis record
    const emotionAnalysis = await EmotionAnalysis.create({
      user: mongoUser._id,
      conversation: call.conversation,
      emotion_scores: emotionResult.allScores,
      dominant_emotion: emotionResult.emotion,
      confidence_score: emotionResult.score,
      audio_features: audioFeatures,
      context: "call",
      analyzed_at: new Date(),
    });

    console.log(`💾 EmotionAnalysis created: ${emotionAnalysis._id} for call ${callId}`);

    // ⭐ STEP 5: Update Call with emotion analysis
    await Call.findByIdAndUpdate(callId, {
      $set: {
        emotion_analysis: {
          emotion: emotionResult.emotion,
          confidence: emotionResult.score,
          analyzed_at: new Date(),
        },
      },
    });

    // Emit emotion analysis result to user
    await emitToUserRoom("callEmotionAnalyzed", userId, {
      call_id: callId,
      emotion: emotionResult.emotion,
      score: emotionResult.score,
      emotion_scores: emotionResult.allScores,
      analysis_id: emotionAnalysis._id.toString(),
      recording_duration: recordingDuration,
      audio_url: audioUrl, // ⭐ NEW
      video_url: videoUrl, // ⭐ NEW
    });

    return {
      success: true,
      emotion: emotionResult.emotion,
      score: emotionResult.score,
      emotionScores: emotionResult.allScores,
      analysisId: emotionAnalysis._id.toString(),
      audioUrl, // ⭐ NEW
      videoUrl, // ⭐ NEW
    };
  } catch (error: any) {
    console.error("❌ Error processing call recording:", error);
    throw new Error(error.message || "Failed to process call recording");
  }
}

/**
 * ⭐ UPDATED: Get emotion analysis for a call - Now includes Cloudinary URLs
 */
export async function getCallEmotionAnalysis(params: {
  callId: string;
  userId?: string;
}) {
  try {
    const { callId, userId } = params;

    await connectToDatabase();

    // Find call with recording URLs
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

    // Get emotion analyses
    const analyses = await EmotionAnalysis.find(query)
      .populate("user", "clerkId full_name username avatar")
      .sort({ analyzed_at: -1 });

    return {
      success: true,
      data: analyses.map((a) => a.toObject()),
      // ⭐ NEW: Include Cloudinary URLs from Call
      audioUrl: call.recording_audio_url,
      videoUrl: call.recording_video_url,
      recordingDuration: call.recording_duration,
      emotionSummary: call.emotion_analysis,
    };
  } catch (error: any) {
    console.error("❌ Error getting call emotion analysis:", error);
    return {
      success: false,
      error: error.message || "Failed to get emotion analysis",
    };
  }
}
