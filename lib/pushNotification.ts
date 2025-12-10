/* eslint-disable @typescript-eslint/no-explicit-any */
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

const expo = new Expo();

interface PushNotificationPayload {
  pushToken: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  sound?: string;
  badge?: number;
}

/**
 * Send push notification with support for call notifications
 */
export async function sendPushNotification({
  pushToken,
  title,
  body,
  data = {},
  channelId = 'default',
  priority = 'high',
  sound = 'default',
  badge,
}: PushNotificationPayload): Promise<ExpoPushTicket | null> {
  console.log('📱 ========================================');
  console.log('📱 Sending push notification...');
  console.log('📱 Token:', pushToken);
  console.log('📱 Title:', title);
  console.log('📱 Body:', body);
  console.log('📱 Channel:', channelId);
  console.log('📱 Priority:', priority);

  if (!Expo.isExpoPushToken(pushToken)) {
    console.error(`📱 ❌ Invalid push token: ${pushToken}`);
    return null;
  }

  const message: ExpoPushMessage = {
    to: pushToken,
    sound,
    title,
    body,
    data,
    priority,
    channelId,
    ...(badge !== undefined && { badge }),
  };

  try {
    console.log('📱 Sending to Expo Push API...');
    const tickets = await expo.sendPushNotificationsAsync([message]);
    
    console.log('📱 ✅ Push notification sent successfully');
    console.log('📱 Ticket:', tickets[0]);
    console.log('📱 ========================================');
    
    return tickets[0];
  } catch (error) {
    console.error('📱 ========================================');
    console.error('📱 ❌ Error sending notification:', error);
    console.error('📱 ========================================');
    return null;
  }
}

/**
 * ⭐ CRITICAL: Specialized function for sending call notifications
 * This ensures maximum priority and visibility on all devices
 */
export async function sendCallNotification({
  pushToken,
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
}: {
  pushToken: string;
  callerName: string;
  callType: 'audio' | 'video';
  callId: string;
  channelName: string;
  conversationId: string;
  callerId: string;
  callerAvatar?: string;
  conversationType?: 'private' | 'group';
  conversationName?: string;
  conversationAvatar?: string;
  participantsCount?: number;
}): Promise<ExpoPushTicket | null> {
  console.log('📞 ========================================');
  console.log('📞 Sending CALL notification...');
  console.log('📞 Caller:', callerName);
  console.log('📞 Type:', callType);
  console.log('📞 Conversation Type:', conversationType);
  
  const isGroupCall = conversationType === 'group';
  
  const title = isGroupCall 
    ? conversationName || 'Group Call'
    : callerName;
  
  const body = isGroupCall
    ? `${callerName} is calling${participantsCount && participantsCount > 0 ? ` (${participantsCount} in call)` : '...'}`
    : callType === 'video' 
      ? '📹 Incoming video call' 
      : '📞 Incoming call';

  if (!Expo.isExpoPushToken(pushToken)) {
    console.error(`📞 ❌ Invalid push token: ${pushToken}`);
    console.log('📞 ========================================');
    return null;
  }

  // ⭐ CRITICAL: Build message with maximum priority settings
  const message: ExpoPushMessage = {
    to: pushToken,
    sound: 'ringtone.wav', // ⭐ Must match your sound file
    title,
    body,
    data: {
      type: 'call',
      action: 'incoming_call', // ⭐ CRITICAL for background handling
      callId,
      channelName,
      conversationId,
      callType,
      callerId,
      caller_name: callerName,
      caller_avatar: callerAvatar,
      conversation_type: conversationType || 'private',
      ...(isGroupCall && {
        conversation_name: conversationName,
        conversation_avatar: conversationAvatar,
        participants_count: participantsCount,
      }),
    },
    channelId: 'calls', // ⭐ CRITICAL: Must match channel in NotificationService
    priority: 'high', // ⭐ CRITICAL for iOS
    badge: 1,
  };

  try {
    console.log('📞 Message config:', JSON.stringify(message, null, 2));
    console.log('📞 Sending to Expo Push API...');
    
    const tickets = await expo.sendPushNotificationsAsync([message]);
    
    console.log('📞 ✅ Call notification sent successfully!');
    console.log('📞 Ticket:', tickets[0]);
    console.log('📞 ========================================');
    
    return tickets[0];
  } catch (error) {
    console.error('📞 ========================================');
    console.error('📞 ❌ Error sending call notification:', error);
    console.error('📞 ========================================');
    return null;
  }
}

/**
 * Send bulk push notifications
 */
export async function sendBulkPushNotifications(
  messages: ExpoPushMessage[]
): Promise<ExpoPushTicket[]> {
  console.log('📱 ========================================');
  console.log(`📱 Sending ${messages.length} bulk notifications...`);
  
  const chunks = expo.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    try {
      console.log(`📱 Sending chunk of ${chunk.length} notifications...`);
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
      console.log(`📱 ✅ Chunk sent successfully`);
    } catch (error) {
      console.error('📱 ❌ Error sending batch:', error);
    }
  }

  console.log(`📱 ✅ Total ${tickets.length} notifications sent`);
  console.log('📱 ========================================');

  return tickets;
}

/**
 * Check push notification receipts
 */
export async function checkPushNotificationReceipts(
  ticketIds: string[]
): Promise<void> {
  console.log('📱 ========================================');
  console.log(`📱 Checking receipts for ${ticketIds.length} tickets...`);

  try {
    const receipts = await expo.getPushNotificationReceiptsAsync(ticketIds);
    
    for (const [ticketId, receipt] of Object.entries(receipts)) {
      if (receipt.status === 'error') {
        console.error(`📱 ❌ Receipt error for ${ticketId}:`, receipt.message);
        if ((receipt as any).details) {
          console.error('📱 Error details:', (receipt as any).details);
        }
      } else {
        console.log(`📱 ✅ Receipt OK for ${ticketId}`);
      }
    }

    console.log('📱 ========================================');
  } catch (error) {
    console.error('📱 ========================================');
    console.error('📱 ❌ Failed to check receipts:', error);
    console.error('📱 ========================================');
  }
}