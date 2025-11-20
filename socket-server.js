/* eslint-disable @typescript-eslint/no-explicit-any */
import cors from "cors";
import express from "express";
import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

console.log("🚀 Starting Socket Server with AI Emotion Features...");

export let io;
export let onlineUsers = [];

// ✨ NEW: Debounce map to prevent rapid online status updates
const userUpdateDebounce = new Map();
const DEBOUNCE_DELAY = 2000; // 2 seconds

// ✨ NEW: Helper to emit online users with debounce
function emitOnlineUsersDebounced() {
  // Clear existing timeout
  if (userUpdateDebounce.has('global')) {
    clearTimeout(userUpdateDebounce.get('global'));
  }

  // Set new timeout
  const timeoutId = setTimeout(() => {
    global.onlineUsers = onlineUsers;
    io.emit("getUsers", onlineUsers);
    console.log("👥 Online users broadcasted:", onlineUsers.length);
    userUpdateDebounce.delete('global');
  }, 500); // Shorter delay for better UX

  userUpdateDebounce.set('global', timeoutId);
}

app
  .prepare()
  .then(() => {
    const expressApp = express();

    expressApp.use(
      cors({
        origin: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        allowedHeaders: [
          "Authorization",
          "Content-Type",
          "Access-Control-Allow-Headers",
        ],
        credentials: true,
      })
    );

    const httpServer = createServer(expressApp);

    io = new Server(httpServer, {
      cors: {
        origin: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
          "Access-Control-Allow-Headers",
          "Access-Control-Allow-Methods",
          "Authorization",
          "Content-Type",
        ],
        credentials: true,
      },
      // ✨ NEW: Add ping/pong settings to keep connection alive
      pingInterval: 25000,
      pingTimeout: 60000,
    });

    global.io = io;
    global.onlineUsers = onlineUsers;

    console.log("✅ Global io instance set successfully");

    io.on("connection", (socket) => {
      console.log(`🔌 New socket connection: ${socket.id}`);

      // ==========================================
      // USER CONNECTION - IMPROVED
      // ==========================================
      socket.on("addNewUsers", (clerkUser) => {
        if (clerkUser) {
          const user_id = clerkUser._id;

          // ✨ Join personal room
          socket.join(`user:${user_id}`);
          console.log(
            `👤 User ${user_id} joined personal room: user:${user_id}`
          );

          // ✨ IMPROVED: Update or add user
          const existingUserIndex = onlineUsers.findIndex(
            (user) => user.userId === user_id
          );

          if (existingUserIndex !== -1) {
            // Update existing user's socket
            const oldSocketId = onlineUsers[existingUserIndex].socketId;
            onlineUsers[existingUserIndex].socketId = socket.id;
            onlineUsers[existingUserIndex].profile = clerkUser;
            onlineUsers[existingUserIndex].lastActive = Date.now();
            
            console.log(`🔄 User ${user_id} socket updated: ${oldSocketId} → ${socket.id}`);
          } else {
            // Add new user
            onlineUsers.push({
              userId: user_id,
              socketId: socket.id,
              profile: clerkUser,
              lastActive: Date.now(),
            });
            console.log(`➕ User ${user_id} added to online users`);
          }

          console.log(`👤 User ${user_id} connected with socket ${socket.id}`);
          console.log("📊 Total online users:", onlineUsers.length);

          // ✨ Emit with debounce to prevent rapid updates
          emitOnlineUsersDebounced();
        }
      });

      // ✨ NEW: Handle explicit user status updates
      socket.on("updateUserStatus", (data) => {
        const { user_id, status } = data;
        
        const userIndex = onlineUsers.findIndex(u => u.userId === user_id);
        if (userIndex !== -1) {
          onlineUsers[userIndex].lastActive = Date.now();
          
          if (status === 'online') {
            console.log(`🟢 User ${user_id} status: online`);
          }
          
          emitOnlineUsersDebounced();
        }
      });

      // ==========================================
      // HELPER FUNCTION
      // ==========================================
      function handleSocketEvent(eventName) {
        socket.on(eventName, async (data) => {
          try {
            console.log(`📨 Event received: ${eventName}`, data);

            socket.emit(`${eventName}Success`, {
              message: `${eventName} event handled successfully`,
              data: data,
              timestamp: new Date(),
            });
          } catch (error) {
            console.error(`❌ Error handling ${eventName}:`, error);
            socket.emit(`${eventName}Error`, {
              error: error.message,
              timestamp: new Date(),
            });
          }
        });
      }

      // Standard events
      handleSocketEvent("callNotification");
      handleSocketEvent("callAnswered");
      handleSocketEvent("callDeclined");
      handleSocketEvent("callEnded");
      handleSocketEvent("callStarted");
      handleSocketEvent("messageNotification");
      handleSocketEvent("messageDelivered");
      handleSocketEvent("messageRead");
      handleSocketEvent("messageSent");
      handleSocketEvent("friendRequestNotification");
      handleSocketEvent("friendRequestAccepted");
      handleSocketEvent("friendRequestCancelled");
      handleSocketEvent("friendRequestDeclined");
      handleSocketEvent("friendRequestSent");
      handleSocketEvent("newMessage");
      handleSocketEvent("sendMessage");
      handleSocketEvent("editMessage");
      handleSocketEvent("deleteMessage");
      handleSocketEvent("getMessages");

      // Typing Events
      socket.on("userTyping", async (data) => {
        try {
          const { conversation_id, user_id, user_name, is_typing } = data;
          
          // ✨ Update user's last active time
          const userIndex = onlineUsers.findIndex(u => u.userId === user_id);
          if (userIndex !== -1) {
            onlineUsers[userIndex].lastActive = Date.now();
          }

          const roomName = `conversation:${conversation_id}`;
          socket.to(roomName).emit("userTyping", {
            conversation_id,
            user_id,
            user_name,
            is_typing,
            timestamp: new Date(),
          });
        } catch (error) {
          console.error(`❌ Error handling userTyping:`, error);
        }
      });
      handleSocketEvent("stopTyping");

      // Call, Friend, Conversation, Group, Reaction, Read Events
      handleSocketEvent("startCall");
      handleSocketEvent("startGroupCall");
      handleSocketEvent("answerCall");
      handleSocketEvent("declineCall");
      handleSocketEvent("endCall");
      handleSocketEvent("joinCall");
      handleSocketEvent("leaveCall");
      handleSocketEvent("getCallHistory");
      handleSocketEvent("sendFriendRequest");
      handleSocketEvent("acceptFriendRequest");
      handleSocketEvent("declineFriendRequest");
      handleSocketEvent("cancelFriendRequest");
      handleSocketEvent("removeFriend");
      handleSocketEvent("blockFriend");
      handleSocketEvent("unblockFriend");
      handleSocketEvent("getFriends");
      handleSocketEvent("getFriendRequests");
      handleSocketEvent("newConversation");
      handleSocketEvent("updateConversation");
      handleSocketEvent("deleteConversation");
      handleSocketEvent("getConversations");
      handleSocketEvent("getConversation");
      handleSocketEvent("getConversationParticipants");
      handleSocketEvent("createGroup");
      handleSocketEvent("updateGroupInfo");
      handleSocketEvent("addGroupMember");
      handleSocketEvent("removeGroupMember");
      handleSocketEvent("leaveGroup");
      handleSocketEvent("deleteGroup");
      handleSocketEvent("newReaction");
      handleSocketEvent("deleteReaction");
      handleSocketEvent("getReactions");
      handleSocketEvent("getMessageReactions");
      handleSocketEvent("markAsRead");
      handleSocketEvent("deleteRead");
      handleSocketEvent("getReads");
      handleSocketEvent("getMessageReads");
      handleSocketEvent("markConversationAsRead");
      handleSocketEvent("getUnreadCount");

      // Join/Leave Conversation
      socket.on("joinConversation", (conversationId) => {
        const roomName = `conversation:${conversationId}`;
        socket.join(roomName);
        console.log(
          `📥 Socket ${socket.id} joined conversation room: ${roomName}`
        );
      });

      socket.on("leaveConversation", (conversationId) => {
        const roomName = `conversation:${conversationId}`;
        socket.leave(roomName);
        console.log(
          `📤 Socket ${socket.id} left conversation room: ${roomName}`
        );
      });

      // ==========================================
      // 🆕 AI CHATBOT EVENTS
      // ==========================================
      socket.on("aiChatMessage", async (data) => {
        try {
          const { user_id, message, conversation_id, include_emotion } = data;
          console.log(`🤖 AI Chat message from user ${user_id}:`, message);

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

          console.log(`✅ AI chat message acknowledged for user ${user_id}`);
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
          console.log(`🤖 AI response ready for user ${user_id}`);

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

          console.log(`✅ AI response delivered to user ${user_id}`);
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
          console.log(`😊 Emotion analysis complete for message ${message_id}`);

          io.to(`user:${user_id}`).emit("emotionAnalyzed", {
            message_id,
            is_sender,
            context,
            emotion: emotion_data.dominant_emotion,
            confidence: emotion_data.confidence_score,
            all_scores: emotion_data.emotion_scores,
            timestamp: new Date(),
          });

          console.log(`✅ Emotion analysis delivered to user ${user_id}`);
        } catch (error) {
          console.error(`❌ Error handling emotionAnalysisComplete:`, error);
        }
      });

      socket.on("requestEmotionRecommendations", async (data) => {
        try {
          const { user_id, emotion, confidence } = data;
          console.log(`💡 Recommendations requested by user ${user_id}`);

          socket.emit("recommendationsProcessing", {
            user_id,
            emotion,
            status: "generating_ai_recommendations",
            timestamp: new Date(),
          });
        } catch (error) {
          console.error(`❌ Error handling requestEmotionRecommendations:`, error);
        }
      });

      socket.on("sendRecommendations", async (data) => {
        try {
          const { user_id, emotion, recommendations, based_on } = data;
          console.log(`💡 Sending AI recommendations to user ${user_id}`);

          io.to(`user:${user_id}`).emit("emotionRecommendations", {
            emotion,
            recommendations,
            based_on: {
              ...based_on,
              source: 'huggingface-ai',
              generated_at: new Date(),
            },
            timestamp: new Date(),
          });

          console.log(`✅ AI recommendations delivered to user ${user_id}`);
        } catch (error) {
          console.error(`❌ Error handling sendRecommendations:`, error);
        }
      });

      socket.on("emotionTrendsUpdate", async (data) => {
        try {
          const { user_id, trends, summary } = data;
          console.log(`📊 Emotion trends update for user ${user_id}`);

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
          console.log(`📊 Bulk emotion analysis for message ${message_id}`);

          participants_data.forEach((participantData) => {
            const { user_id, emotion, confidence, recommendations, is_sender } = participantData;
            
            io.to(`user:${user_id}`).emit("emotionAnalyzedWithRecommendations", {
              message_id,
              conversation_id,
              is_sender,
              emotion_data: { emotion, confidence },
              recommendations: recommendations || [],
              timestamp: new Date(),
            });
          });

          console.log(`✅ Bulk emotion analysis completed`);
        } catch (error) {
          console.error(`❌ Error handling bulkEmotionAnalysis:`, error);
        }
      });

      // Test Events
      socket.on("test", (data) => {
        console.log("📨 Test event received:", data);
        socket.emit("testResponse", {
          message: "Test successful!",
          timestamp: new Date(),
          receivedData: data,
        });
      });

      socket.on("echo", (data) => {
        console.log("🔄 Echo request:", data);
        socket.emit("echoResponse", {
          echo: data,
          timestamp: new Date(),
        });
      });

      // ==========================================
      // DISCONNECT - IMPROVED WITH GRACE PERIOD
      // ==========================================
      socket.on("disconnect", () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);

        const disconnectedUser = onlineUsers.find(
          (user) => user.socketId === socket.id
        );
        
        if (disconnectedUser) {
          const user_id = disconnectedUser.userId;
          
          // ✨ IMPROVED: Grace period before removing (for screen transitions)
          setTimeout(() => {
            // Check if user reconnected with a different socket
            const currentUser = onlineUsers.find(u => u.userId === user_id);
            
            if (currentUser && currentUser.socketId === socket.id) {
              // User didn't reconnect, remove them
              onlineUsers = onlineUsers.filter(
                (user) => user.socketId !== socket.id
              );
              console.log(`👋 User ${user_id} removed from online users`);
              
              global.onlineUsers = onlineUsers;
              emitOnlineUsersDebounced();
            } else {
              console.log(`✅ User ${user_id} reconnected, keeping online status`);
            }
          }, DEBOUNCE_DELAY); // 2 second grace period
        }
      });

      console.log("🤖 AI Emotion & Recommendation events registered");
    });

    // ✨ NEW: Cleanup stale debounce timeouts on shutdown
    process.on('SIGTERM', () => {
      userUpdateDebounce.forEach(timeout => clearTimeout(timeout));
      userUpdateDebounce.clear();
    });

    // Next.js handler
    expressApp.use((req, res) => {
      return handler(req, res);
    });

    // Start server
    httpServer.listen(port, () => {
      console.log(`🚀 Server ready on http://${hostname}:${port}`);
      console.log(`📡 Socket.IO server running`);
      console.log(`✅ Online status debouncing enabled (${DEBOUNCE_DELAY}ms grace period)`);
      console.log(`🤖 AI Emotion Analysis: Enabled for ALL emotions`);
    });
  })
  .catch((err) => {
    console.error("❌ Error starting server:", err);
    process.exit(1);
  });