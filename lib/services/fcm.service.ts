// lib/services/fcm.service.ts - NEW FILE
import { getFirebaseAdmin } from '../firebase-admin';

interface SendCallNotificationParams {
  fcmToken: string;
  callerName: string;
  callType: 'audio' | 'video';
  callId: string;
  channelName: string;
  conversationId: string;
  callerId: string;
  callerAvatar?: string;
  conversationType: 'private' | 'group';
  conversationName?: string;
  conversationAvatar?: string;
  participantsCount?: number;
}

/**
 * ⭐ Send FCM notification for incoming calls
 * This triggers full-screen notification on Android
 */
export async function sendCallNotification(params: SendCallNotificationParams) {
  const {
    fcmToken,
    callerName,
    callType,
    callId,
    channelName,
    conversationId,
    callerId,
    callerAvatar,
    conversationType,
    conversationName,
    conversationAvatar,
    participantsCount,
  } = params;

  try {
    const admin = getFirebaseAdmin();

    const message = {
      token: fcmToken,
      notification: {
        title: callerName,
        body: callType === 'video' ? '📹 Incoming video call' : '📞 Incoming audio call',
      },
      data: {
        // ⭐ CRITICAL: These fields are used by native code
        type: 'call',
        action: 'incoming_call',
        callId,
        channelName,
        conversationId,
        callType,
        callerId,
        caller_name: callerName,
        caller_avatar: callerAvatar || '',
        conversation_type: conversationType,
        conversation_name: conversationName || '',
        conversation_avatar: conversationAvatar || '',
        participants_count: String(participantsCount || 0),
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'incoming_calls', // Must match CallNotificationModule
          priority: 'max' as const,
          visibility: 'public' as const,
          defaultSound: true,
          defaultVibrateTimings: true,
          tag: callId, // Prevent duplicates
        },
        // ⭐ CRITICAL: Time to live - call expires after 30s
        ttl: 30000,
      },
      apns: {
        headers: {
          'apns-priority': '10', // High priority
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            contentAvailable: true,
            category: 'INCOMING_CALL', // For CallKit
          },
        },
      },
    };

    console.log('📤 Sending FCM call notification:', {
      to: fcmToken.substring(0, 30) + '...',
      callId,
      callerName,
      callType,
    });

    const response = await admin.messaging().send(message);
    
    console.log('✅ FCM notification sent successfully:', response);
    
    return { 
      status: 'ok', 
      messageId: response,
      platform: 'fcm',
    };
  } catch (error: any) {
    console.error('❌ Error sending FCM notification:', error);
    
    // Log detailed error for debugging
    if (error.code) {
      console.error('Error code:', error.code);
    }
    if (error.message) {
      console.error('Error message:', error.message);
    }
    
    return { 
      status: 'error', 
      message: error.message,
      code: error.code,
    };
  }
}

/**
 * Send FCM notification to multiple tokens
 */
export async function sendCallNotificationMulticast(
  tokens: string[],
  params: Omit<SendCallNotificationParams, 'fcmToken'>
) {
  const {
    callerName,
    callType,
    callId,
    channelName,
    conversationId,
    callerId,
    callerAvatar,
    conversationType,
    conversationName,
    conversationAvatar,
    participantsCount,
  } = params;

  try {
    const admin = getFirebaseAdmin();

    const message = {
      tokens, // Array of FCM tokens
      notification: {
        title: callerName,
        body: callType === 'video' ? '📹 Incoming video call' : '📞 Incoming audio call',
      },
      data: {
        type: 'call',
        action: 'incoming_call',
        callId,
        channelName,
        conversationId,
        callType,
        callerId,
        caller_name: callerName,
        caller_avatar: callerAvatar || '',
        conversation_type: conversationType,
        conversation_name: conversationName || '',
        conversation_avatar: conversationAvatar || '',
        participants_count: String(participantsCount || 0),
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'incoming_calls',
          priority: 'max' as const,
          visibility: 'public' as const,
          defaultSound: true,
          defaultVibrateTimings: true,
          tag: callId,
        },
        ttl: 30000,
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            contentAvailable: true,
            category: 'INCOMING_CALL',
          },
        },
      },
    };

    console.log(`📤 Sending FCM multicast to ${tokens.length} devices`);

    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log('✅ Multicast response:', {
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    // Log failures
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`❌ Failed to send to token ${idx}:`, resp.error);
        }
      });
    }
    
    return { 
      status: 'ok', 
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses,
    };
  } catch (error: any) {
    console.error('❌ Error sending FCM multicast:', error);
    
    return { 
      status: 'error', 
      message: error.message,
      code: error.code,
    };
  }
}

/**
 * Check if token is valid FCM token
 */
export function isValidFCMToken(token: string): boolean {
  // FCM tokens are long strings without "ExponentPushToken" prefix
  return token.length > 50 && !token.startsWith('ExponentPushToken[');
}