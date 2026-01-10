// server.js - FIXED TYPING INDICATOR
// ✅ Separate events: sendTypingIndicator (client->server) vs userTyping (server->client)
// ✅ Proper room broadcasting
// ✅ Debug logging

import { fileURLToPath } from "url";
import { dirname } from "path";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import dotenv from "dotenv";

dotenv.config();

import * as activeUsers from "./lib/socket/activeUsers.js";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const API_BASE_URL = process.env.API_BASE_URL || `http://${hostname}:${port}`;
const SOCKET_PING_INTERVAL = parseInt(
  process.env.SOCKET_PING_INTERVAL || "25000",
  10
);
const SOCKET_PING_TIMEOUT = parseInt(
  process.env.SOCKET_PING_TIMEOUT || "60000",
  10
);
const DEBOUNCE_DELAY = parseInt(
  process.env.SOCKET_DEBOUNCE_DELAY || "2000",
  10
);
const USER_ACTIVITY_THROTTLE = parseInt(
  process.env.SOCKET_USER_ACTIVITY_THROTTLE || "30000",
  10
);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ✅ LOG LEVEL
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const shouldLog = (level) => {
  const levels = { debug: 0, info: 1, error: 2 };
  return levels[level] >= levels[LOG_LEVEL];
};

console.log("🚀 Starting Socket Server with AI Emotion Features...");
console.log(`📍 Environment: ${process.env.NODE_ENV}`);
console.log(`🌐 Hostname: ${hostname}`);
console.log(`🔌 Port: ${port}`);
console.log(`🔗 API Base URL: ${API_BASE_URL}`);
console.log(`🔇 Log Level: ${LOG_LEVEL}`);

export let io;
export let onlineUsers = [];

const userUpdateDebounce = new Map();
const lastApiCall = new Map();
const API_THROTTLE = 30000;

// ✅ TYPING STATE TRACKING (để debug)
const activeTypers = new Map(); // conversationId -> Set<userId>

async function updateUserLastSeen(user_id, is_online, last_seen) {
  const now = Date.now();
  const lastCall = lastApiCall.get(user_id);

  if (lastCall && now - lastCall < API_THROTTLE) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/user/update-last-seen`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id,
        is_online,
        last_seen: last_seen || new Date(),
      }),
    });

    if (!response.ok) {
      if (shouldLog("error")) {
        console.error(`❌ API error ${response.status} for user ${user_id}`);
      }
      return null;
    }

    lastApiCall.set(user_id, now);
    const data = await response.json();

    if (shouldLog("debug")) {
      console.log(`✅ Last seen updated for ${user_id}`);
    }

    return data;
  } catch (error) {
    if (shouldLog("error")) {
      console.error(`❌ API call failed:`, error.message);
    }
    return null;
  }
}

function emitOnlineUsersDebounced() {
  if (userUpdateDebounce.has("global")) {
    clearTimeout(userUpdateDebounce.get("global"));
  }

  const timeoutId = setTimeout(() => {
    global.onlineUsers = onlineUsers;
    io.emit("getUsers", onlineUsers);

    if (shouldLog("debug")) {
      console.log("👥 Online users broadcasted:", onlineUsers.length);
    }

    userUpdateDebounce.delete("global");
  }, 500);

  userUpdateDebounce.set("global", timeoutId);
}

app.prepare().then(() => {
  const expressApp = express();

  expressApp.use(
    cors({
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Authorization",
        "Content-Type",
        "Access-Control-Allow-Headers",
      ],
    })
  );

  const httpServer = createServer(expressApp);

  io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Access-Control-Allow-Headers",
        "Access-Control-Allow-Methods",
        "Authorization",
        "Content-Type",
      ],
    },
    pingInterval: SOCKET_PING_INTERVAL,
    pingTimeout: SOCKET_PING_TIMEOUT,
  });

  global.io = io;
  global.onlineUsers = onlineUsers;

  console.log("✅ Global io instance set successfully");

  io.on("connection", (socket) => {
    if (shouldLog("info")) {
      console.log(`🔌 New socket connection: ${socket.id}`);
    }

    // ==========================================
    // USER ONLINE TRACKING
    // ==========================================
    socket.on("addNewUsers", async (clerkUser) => {
      if (!clerkUser?._id) return;

      const user_id = clerkUser._id;
      socket.join(`user:${user_id}`);

      let lastSeenFromDB = new Date();
      let isOnlineFromDB = true;

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/user/${user_id}/last-seen`
        );

        if (response.ok) {
          const data = await response.json();
          lastSeenFromDB = data.last_seen
            ? new Date(data.last_seen)
            : new Date();

          console.log(`📅 [SERVER] Fetched last_seen for ${user_id}:`, {
            last_seen: lastSeenFromDB,
            last_seen_type: typeof lastSeenFromDB,
          });
          isOnlineFromDB = data.is_online || false;

          if (shouldLog("debug")) {
            console.log(`📅 Fetched last_seen for ${user_id}:`, lastSeenFromDB);
          }
        }
      } catch (error) {
        if (shouldLog("error")) {
          console.error(
            `⚠️ Failed to fetch last_seen for user ${user_id}:`,
            error.message
          );
        }
        lastSeenFromDB = new Date();
      }

      const existingIndex = onlineUsers.findIndex((u) => u.userId === user_id);
      const now = Date.now();

      if (existingIndex !== -1) {
        const oldSocket = onlineUsers[existingIndex].socketId;
        onlineUsers[existingIndex] = {
          ...onlineUsers[existingIndex],
          socketId: socket.id,
          profile: clerkUser,
          lastActive: now,
          last_seen: lastSeenFromDB,
        };

        if (shouldLog("debug")) {
          console.log(
            `🔄 User ${user_id} reconnected: ${oldSocket} → ${socket.id}`
          );
        }
      } else {
        onlineUsers.push({
          userId: user_id,
          socketId: socket.id,
          profile: clerkUser,
          lastActive: now,
          last_seen: lastSeenFromDB,
        });

        if (shouldLog("info")) {
          console.log(
            `➕ User ${user_id} added with last_seen: ${lastSeenFromDB}`
          );
        }
      }

      await updateUserLastSeen(user_id, true, new Date());
      emitOnlineUsersDebounced();
    });

    socket.on("updateUserStatus", async ({ user_id }) => {
      const user = onlineUsers.find((u) => u.userId === user_id);
      if (user) {
        const now = Date.now();
        user.lastActive = now;
        user.last_seen = new Date(now);

        io.emit("userLastSeenUpdated", {
          user_id,
          last_seen: new Date(now),
          is_online: true,
        });

        emitOnlineUsersDebounced();
      }
    });

    // ==========================================
    // ACTIVE USER IN CONVERSATION
    // ==========================================
    socket.on("enterConversation", ({ user_id, conversation_id }) => {
      activeUsers.setUserActiveInConversation(
        user_id,
        conversation_id,
        socket.id
      );

      if (shouldLog("debug")) {
        console.log(
          `✅ [ACTIVE] User ${user_id} entered conversation ${conversation_id}`
        );
      }
    });

    socket.on("leaveConversation", (data) => {
      let conversation_id, user_id;

      if (typeof data === "string") {
        conversation_id = data;
      } else {
        conversation_id = data.conversation_id;
        user_id = data.user_id;
      }

      if (conversation_id && user_id) {
        activeUsers.setUserInactiveInConversation(user_id, conversation_id);

        if (shouldLog("debug")) {
          console.log(
            `👋 [ACTIVE] User ${user_id} left conversation ${conversation_id}`
          );
        }
      }

      if (conversation_id) {
        const room = `conversation:${conversation_id}`;
        socket.leave(room);

        if (shouldLog("debug")) {
          console.log(`📤 Socket ${socket.id} left room: ${room}`);
        }
      }
    });

    socket.on("conversationActivity", ({ user_id, conversation_id }) => {
      activeUsers.updateUserActivity(user_id, conversation_id);

      if (shouldLog("debug")) {
        console.log(`🔄 [ACTIVE] Activity updated for user ${user_id}`);
      }
    });

    // ==========================================
    // JOIN/LEAVE ROOM
    // ==========================================
    socket.on("joinConversation", (data) => {
      const conversationId =
        typeof data === "string" ? data : data.conversation_id;
      const userId = typeof data === "object" ? data.user_id : null;

      if (!conversationId) {
        console.error("❌ Missing conversationId in joinConversation");
        return;
      }

      const room = `conversation:${conversationId}`;
      socket.join(room);

      if (shouldLog("debug")) {
        console.log(
          `📥 Socket ${socket.id} (user: ${userId}) joined room: ${room}`
        );
      }

      socket.emit("joinedConversation", {
        conversationId,
        room,
        success: true,
      });
    });

    socket.on("joinCallRoom", ({ callId, conversationId }) => {
      if (!callId) {
        console.error("❌ Missing callId in joinCallRoom");
        socket.emit("error", { message: "callId is required" });
        return;
      }

      const callRoom = `call:${callId}`;
      socket.join(callRoom);

      if (shouldLog("debug")) {
        console.log(`📞 Socket ${socket.id} joined call room: ${callRoom}`);
      }

      socket.emit("joinedCallRoom", {
        callId,
        callRoom,
        conversationId,
        success: true,
      });
    });

    socket.on("leaveCallRoom", ({ callId }) => {
      if (!callId) {
        console.error("❌ Missing callId in leaveCallRoom");
        return;
      }

      const callRoom = `call:${callId}`;
      socket.leave(callRoom);

      if (shouldLog("debug")) {
        console.log(`📞 Socket ${socket.id} left call room: ${callRoom}`);
      }

      socket.emit("leftCallRoom", {
        callId,
        callRoom,
        success: true,
      });
    });

    // ==========================================
    // ✅ TYPING INDICATOR - FIXED VERSION
    // ==========================================
    socket.on(
      "sendTypingIndicator",
      ({ conversation_id, user_id, user_name, is_typing }) => {
        console.log(
          `⌨️ [SERVER] Typing event from ${user_name} (${user_id}): ${is_typing} in conversation ${conversation_id}`
        );

        // Update tracking
        if (!activeTypers.has(conversation_id)) {
          activeTypers.set(conversation_id, new Set());
        }

        const typers = activeTypers.get(conversation_id);
        if (is_typing) {
          typers.add(user_id);
        } else {
          typers.delete(user_id);
        }

        console.log(
          `⌨️ [SERVER] Active typers in ${conversation_id}:`,
          Array.from(typers)
        );

        // Update user activity
        const user = onlineUsers.find((u) => u.userId === user_id);
        if (user) {
          user.lastActive = Date.now();
        }

        // ✅ CRITICAL: Broadcast to ROOM except sender
        const room = `conversation:${conversation_id}`;
        const eventData = {
          conversation_id,
          user_id,
          user_name,
          is_typing,
          timestamp: new Date(),
        };

        socket.to(room).emit("userTyping", eventData);

        console.log(
          `⌨️ [SERVER] ✅ Broadcasted typing to room ${room}, event:`,
          eventData
        );

        // Log room members for debugging
        const roomSockets = io.sockets.adapter.rooms.get(room);
        console.log(
          `⌨️ [SERVER] Room ${room} has ${roomSockets?.size || 0} members:`,
          roomSockets ? Array.from(roomSockets) : []
        );
      }
    );

    // ==========================================
    // AI CHATBOT EVENTS
    // ==========================================
    socket.on("aiChatMessage", async (data) => {
      try {
        const { user_id, message, conversation_id, include_emotion } = data;

        if (shouldLog("debug")) {
          console.log(`🤖 AI Chat message from user ${user_id}:`, message);
        }

        socket.emit("aiTyping", {
          conversation_id,
          is_typing: true,
        });

        io.to(`user:${user_id}`).emit("aiChatMessageReceived", {
          conversation_id,
          user_message: message,
          timestamp: new Date(),
          status: "processing",
        });
      } catch (error) {
        console.error(`❌ Error handling aiChatMessage:`, error);
        socket.emit("aiChatError", {
          error: error.message,
          timestamp: new Date(),
        });
      }
    });

    socket.on("aiResponseReady", async (data) => {
      try {
        const {
          user_id,
          conversation_id,
          response,
          emotion_detected,
          suggestions,
        } = data;

        if (shouldLog("debug")) {
          console.log(`🤖 AI response ready for user ${user_id}`);
        }

        socket.emit("aiTyping", {
          conversation_id,
          is_typing: false,
        });

        io.to(`user:${user_id}`).emit("aiChatResponse", {
          conversation_id,
          message: response,
          emotion_detected,
          suggestions,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error(`❌ Error handling aiResponseReady:`, error);
      }
    });

    // ==========================================
    // EMOTION ANALYSIS & RECOMMENDATIONS
    // ==========================================
    socket.on("emotionAnalysisComplete", async (data) => {
      try {
        const { user_id, message_id, emotion_data, is_sender, context } = data;

        if (shouldLog("debug")) {
          console.log(`😊 Emotion analysis complete for message ${message_id}`);
        }

        io.to(`user:${user_id}`).emit("emotionAnalyzed", {
          message_id,
          is_sender,
          context,
          emotion: emotion_data.dominant_emotion,
          confidence: emotion_data.confidence_score,
          all_scores: emotion_data.emotion_scores,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error(`❌ Error handling emotionAnalysisComplete:`, error);
      }
    });

    socket.on("requestEmotionRecommendations", async (data) => {
      try {
        const { user_id, emotion, confidence } = data;

        if (shouldLog("debug")) {
          console.log(`💡 Recommendations requested by user ${user_id}`);
        }

        socket.emit("recommendationsProcessing", {
          user_id,
          emotion,
          status: "generating_ai_recommendations",
          timestamp: new Date(),
        });
      } catch (error) {
        console.error(
          `❌ Error handling requestEmotionRecommendations:`,
          error
        );
      }
    });

    socket.on("sendRecommendations", async (data) => {
      try {
        const { user_id, emotion, recommendations, based_on } = data;

        if (shouldLog("debug")) {
          console.log(`💡 Sending AI recommendations to user ${user_id}`);
        }

        io.to(`user:${user_id}`).emit("emotionRecommendations", {
          emotion,
          recommendations,
          based_on: {
            ...based_on,
            source: "huggingface-ai",
            generated_at: new Date(),
          },
          timestamp: new Date(),
        });
      } catch (error) {
        console.error(`❌ Error handling sendRecommendations:`, error);
      }
    });

    socket.on("emotionTrendsUpdate", async (data) => {
      try {
        const { user_id, trends, summary } = data;

        if (shouldLog("debug")) {
          console.log(`📊 Emotion trends update for user ${user_id}`);
        }

        io.to(`user:${user_id}`).emit("emotionTrendsUpdated", {
          trends,
          summary,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error(`❌ Error handling emotionTrendsUpdate:`, error);
      }
    });

    socket.on("bulkEmotionAnalysis", async (data) => {
      try {
        const { message_id, conversation_id, participants_data } = data;

        if (shouldLog("debug")) {
          console.log(`📊 Bulk emotion analysis for message ${message_id}`);
        }

        participants_data.forEach((participantData) => {
          const { user_id, emotion, confidence, recommendations, is_sender } =
            participantData;

          io.to(`user:${user_id}`).emit("emotionAnalyzedWithRecommendations", {
            message_id,
            conversation_id,
            is_sender,
            emotion_data: { emotion, confidence },
            recommendations: recommendations || [],
            timestamp: new Date(),
          });
        });
      } catch (error) {
        console.error(`❌ Error handling bulkEmotionAnalysis:`, error);
      }
    });

    // ==========================================
    // TEST EVENTS
    // ==========================================
    socket.on("test", (data) => {
      if (shouldLog("debug")) {
        console.log("📨 Test event received:", data);
      }

      socket.emit("testResponse", {
        message: "Test successful!",
        timestamp: new Date(),
        receivedData: data,
      });
    });

    socket.on("echo", (data) => {
      if (shouldLog("debug")) {
        console.log("🔄 Echo request:", data);
      }

      socket.emit("echoResponse", {
        echo: data,
        timestamp: new Date(),
      });
    });

    // ==========================================
    // DISCONNECT WITH GRACE PERIOD
    // ==========================================
    socket.on("disconnect", () => {
      if (shouldLog("info")) {
        console.log(`🔌 Socket disconnected: ${socket.id}`);
      }

      const user = onlineUsers.find((u) => u.socketId === socket.id);
      if (!user) return;

      const user_id = user.userId;

      // Clean up typing state
      activeTypers.forEach((typers, conversationId) => {
        if (typers.has(user_id)) {
          typers.delete(user_id);
          console.log(
            `⌨️ [SERVER] Removed ${user_id} from typing in ${conversationId} due to disconnect`
          );
        }
      });

      setTimeout(async () => {
        const stillConnected = onlineUsers.find((u) => u.userId === user_id);
        if (stillConnected?.socketId === socket.id) {
          const lastSeenTime = new Date();

          stillConnected.last_seen = lastSeenTime;

          await updateUserLastSeen(user_id, false, lastSeenTime);

          io.emit("userLastSeenUpdated", {
            user_id,
            last_seen: lastSeenTime,
            is_online: false,
          });

          onlineUsers = onlineUsers.filter((u) => u.socketId !== socket.id);
          activeUsers.removeUserFromAllConversations(user_id);

          if (shouldLog("info")) {
            console.log(
              `👋 User ${user_id} offline - last_seen: ${lastSeenTime}`
            );
          }

          global.onlineUsers = onlineUsers;
          emitOnlineUsersDebounced();
        }
      }, DEBOUNCE_DELAY);
    });

    socket.on("userActivity", async ({ user_id }) => {
      const user = onlineUsers.find((u) => u.userId === user_id);
      if (user) {
        const now = Date.now();
        user.lastActive = now;
        user.last_seen = new Date(now);

        if (
          !user.lastDbUpdate ||
          now - user.lastDbUpdate > USER_ACTIVITY_THROTTLE
        ) {
          await updateUserLastSeen(user_id, true, new Date(now));
          user.lastDbUpdate = now;
        }

        io.emit("userLastSeenUpdated", {
          user_id,
          last_seen: new Date(now),
          is_online: true,
        });
      }
    });

    if (shouldLog("debug")) {
      console.log("✅ All socket events registered for", socket.id);
    }
  });

  process.on("SIGTERM", () => {
    userUpdateDebounce.forEach((t) => clearTimeout(t));
    userUpdateDebounce.clear();
  });

  expressApp.use((req, res) => handler(req, res));

  httpServer.listen(port, () => {
    console.log(`🚀 Server ready on http://${hostname}:${port}`);
    console.log(`📡 Socket.IO server running`);
    console.log(`🔗 API endpoint: ${API_BASE_URL}/api/user/update-last-seen`);
    console.log(
      `✅ Online status debouncing: ${DEBOUNCE_DELAY}ms grace period`
    );
    console.log(`⏱️ User activity throttle: ${USER_ACTIVITY_THROTTLE}ms`);
    console.log(`⏱️ API call throttle: ${API_THROTTLE}ms per user`);
    console.log(
      `🔇 Log level: ${LOG_LEVEL} (set LOG_LEVEL=error to reduce logs)`
    );
    console.log(`🤖 AI Emotion Analysis: Enabled`);
    console.log(`✅ Active User Tracking: Enabled & Optimized`);
    console.log(`⌨️ Typing Indicator: ✅ FIXED & ENABLED`);
  });
});