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

console.log("🚀 Starting Socket Server with Next.js...");

export let io;
export let onlineUsers = [];

app
  .prepare()
  .then(() => {
    const expressApp = express();

    // Cấu hình CORS cho Express
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

    // Tạo HTTP server
    const httpServer = createServer(expressApp);

    // Cấu hình Socket.IO với CORS
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
    });

    // Expose io và onlineUsers globally
    global.io = io;
    global.onlineUsers = onlineUsers;

    console.log("✅ Global io instance set successfully");

    io.on("connection", (socket) => {
      console.log(`🔌 New socket connection: ${socket.id}`);

      // Add new user event
      socket.on("addNewUsers", (clerkUser) => {
        if (clerkUser) {
          const user_id = clerkUser._id;

          // ✅ JOIN PERSONAL ROOM - QUAN TRỌNG cho ConversationsScreen
          socket.join(`user:${user_id}`);
          console.log(
            `👤 User ${user_id} joined personal room: user:${user_id}`
          );

          // Update online users array
          const existingUserIndex = onlineUsers.findIndex(
            (user) => user.userId === user_id
          );

          if (existingUserIndex !== -1) {
            onlineUsers[existingUserIndex].socketId = socket.id;
          } else {
            onlineUsers.push({
              userId: user_id,
              socketId: socket.id,
              profile: clerkUser,
            });
          }

          console.log(`👤 User ${user_id} connected with socket ${socket.id}`);
          console.log("📊 Total online users:", onlineUsers.length);
        }

        // Update global reference
        global.onlineUsers = onlineUsers;
        io.emit("getUsers", onlineUsers);
      });

      // Helper function to handle socket events
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

      // Notification Events
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

      // Message Events
      handleSocketEvent("newMessage");
      handleSocketEvent("sendMessage");
      handleSocketEvent("editMessage");
      handleSocketEvent("deleteMessage");
      handleSocketEvent("getMessages");

      // Typing Events
      socket.on("userTyping", async (data) => {
        try {
          const { conversation_id, user_id, user_name, is_typing } = data;
          console.log(`⌨️ User typing event:`, {
            conversation_id,
            user_id,
            user_name,
            is_typing,
          });

          // Emit to conversation room (excluding sender)
          const roomName = `conversation:${conversation_id}`;
          socket.to(roomName).emit("userTyping", {
            conversation_id,
            user_id,
            user_name,
            is_typing,
            timestamp: new Date(),
          });

          console.log(`✅ Typing event broadcasted to room ${roomName}`);
        } catch (error) {
          console.error(`❌ Error handling userTyping:`, error);
        }
      });
      handleSocketEvent("stopTyping");

      // Call Events
      handleSocketEvent("startCall");
      handleSocketEvent("startGroupCall");
      handleSocketEvent("answerCall");
      handleSocketEvent("declineCall");
      handleSocketEvent("endCall");
      handleSocketEvent("joinCall");
      handleSocketEvent("leaveCall");
      handleSocketEvent("getCallHistory");

      // Friend Events
      handleSocketEvent("sendFriendRequest");
      handleSocketEvent("acceptFriendRequest");
      handleSocketEvent("declineFriendRequest");
      handleSocketEvent("cancelFriendRequest");
      handleSocketEvent("removeFriend");
      handleSocketEvent("blockFriend");
      handleSocketEvent("unblockFriend");
      handleSocketEvent("getFriends");
      handleSocketEvent("getFriendRequests");

      // Conversation Events
      handleSocketEvent("newConversation");
      handleSocketEvent("updateConversation");
      handleSocketEvent("deleteConversation");
      handleSocketEvent("getConversations");
      handleSocketEvent("getConversation");
      handleSocketEvent("getConversationParticipants");

      // Group Events
      handleSocketEvent("createGroup");
      handleSocketEvent("updateGroupInfo");
      handleSocketEvent("addGroupMember");
      handleSocketEvent("removeGroupMember");
      handleSocketEvent("leaveGroup");
      handleSocketEvent("deleteGroup");

      // Reaction Events
      handleSocketEvent("newReaction");
      handleSocketEvent("deleteReaction");
      handleSocketEvent("getReactions");
      handleSocketEvent("getMessageReactions");

      // Read Events
      handleSocketEvent("markAsRead");
      handleSocketEvent("deleteRead");
      handleSocketEvent("getReads");
      handleSocketEvent("getMessageReads");
      handleSocketEvent("markConversationAsRead");
      handleSocketEvent("getUnreadCount");

      // Join/Leave Conversation Room
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

      // Disconnect event
      socket.on("disconnect", () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);

        // Remove from online users
        const disconnectedUser = onlineUsers.find(
          (user) => user.socketId === socket.id
        );
        if (disconnectedUser) {
          onlineUsers = onlineUsers.filter(
            (user) => user.socketId !== socket.id
          );
          console.log(`👤 User ${disconnectedUser.userId} disconnected`);
        }

        // Update global reference
        global.onlineUsers = onlineUsers;
        io.emit("getUsers", onlineUsers);
      });
      socket.on("aiChatMessage", async (data) => {
        try {
          const { user_id, message, conversation_id, include_emotion } = data;
          console.log(`🤖 AI Chat message from user ${user_id}:`, message);

          // Emit typing indicator
          socket.emit("aiTyping", {
            conversation_id,
            is_typing: true,
          });

          // Send to personal room
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

      // AI Response Ready
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

          // Stop typing indicator
          socket.emit("aiTyping", {
            conversation_id,
            is_typing: false,
          });

          // Send response to user's personal room
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

      // Emotion Analysis Complete
      socket.on("emotionAnalysisComplete", async (data) => {
        try {
          const { user_id, message_id, emotion_data } = data;
          console.log(`😊 Emotion analysis complete for message ${message_id}`);

          // Send to user's personal room
          io.to(`user:${user_id}`).emit("emotionAnalyzed", {
            message_id,
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

      // Request Emotion Recommendations
      socket.on("requestEmotionRecommendations", async (data) => {
        try {
          const { user_id } = data;
          console.log(`💡 Recommendations requested by user ${user_id}`);

          // Emit acknowledgment
          socket.emit("recommendationsProcessing", {
            user_id,
            status: "processing",
            timestamp: new Date(),
          });

          console.log(
            `✅ Recommendations request acknowledged for user ${user_id}`
          );
        } catch (error) {
          console.error(
            `❌ Error handling requestEmotionRecommendations:`,
            error
          );
        }
      });

      // Send Recommendations
      socket.on("sendRecommendations", async (data) => {
        try {
          const { user_id, recommendations, based_on } = data;
          console.log(`💡 Sending recommendations to user ${user_id}`);

          // Send to user's personal room
          io.to(`user:${user_id}`).emit("emotionRecommendations", {
            recommendations,
            based_on,
            timestamp: new Date(),
          });

          console.log(`✅ Recommendations delivered to user ${user_id}`);
        } catch (error) {
          console.error(`❌ Error handling sendRecommendations:`, error);
        }
      });

      // Emotion Trends Update
      socket.on("emotionTrendsUpdate", async (data) => {
        try {
          const { user_id, trends, summary } = data;
          console.log(`📊 Emotion trends update for user ${user_id}`);

          // Send to user's personal room
          io.to(`user:${user_id}`).emit("emotionTrendsUpdated", {
            trends,
            summary,
            timestamp: new Date(),
          });

          console.log(`✅ Emotion trends delivered to user ${user_id}`);
        } catch (error) {
          console.error(`❌ Error handling emotionTrendsUpdate:`, error);
        }
      });

      console.log("🤖 AI Chatbot events registered");
    });

    // Next.js API routes và Pages
    expressApp.use((req, res) => {
      return handler(req, res);
    });

    // Khởi động server
    httpServer.listen(port, () => {
      console.log(`🚀 Server ready on http://${hostname}:${port}`);
      console.log(`📡 Socket.IO server running`);
      console.log(`✅ Global io instance available`);
      console.log(`🔧 Features: Personal Rooms + Conversation Rooms`);
    });
  })
  .catch((err) => {
    console.error("❌ Error starting server:", err);
    process.exit(1);
  });
