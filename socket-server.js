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
    });

    global.io = io;
    global.onlineUsers = onlineUsers;

    console.log("✅ Global io instance set successfully");

    io.on("connection", (socket) => {
      console.log(`🔌 New socket connection: ${socket.id}`);

      // ==========================================
      // USER CONNECTION
      // ==========================================
      socket.on("addNewUsers", (clerkUser) => {
        if (clerkUser) {
          const user_id = clerkUser._id;

          socket.join(`user:${user_id}`);
          console.log(
            `👤 User ${user_id} joined personal room: user:${user_id}`
          );

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

        global.onlineUsers = onlineUsers;
        io.emit("getUsers", onlineUsers);
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
          console.log(`⌨️ User typing event:`, {
            conversation_id,
            user_id,
            user_name,
            is_typing,
          });

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

          // Emit typing indicator
          socket.emit("aiTyping", {
            conversation_id,
            is_typing: true,
          });

          // Acknowledge receipt
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
      // 🆕 EMOTION ANALYSIS EVENTS - ALL EMOTIONS
      // ==========================================
      socket.on("emotionAnalysisComplete", async (data) => {
        try {
          const { user_id, message_id, emotion_data, is_sender, context } = data;
          console.log(`😊 Emotion analysis complete for message ${message_id}`);
          console.log(`   Emotion: ${emotion_data.dominant_emotion} (${(emotion_data.confidence_score * 100).toFixed(0)}%)`);

          // Send to user's personal room
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

      // ==========================================
      // 🆕 AI RECOMMENDATIONS - FOR ALL EMOTIONS
      // ==========================================
      socket.on("requestEmotionRecommendations", async (data) => {
        try {
          const { user_id, emotion, confidence } = data;
          console.log(`💡 Recommendations requested by user ${user_id} for emotion: ${emotion}`);

          // Emit processing status
          socket.emit("recommendationsProcessing", {
            user_id,
            emotion,
            status: "generating_ai_recommendations",
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

      // Send AI-generated recommendations
      socket.on("sendRecommendations", async (data) => {
        try {
          const { user_id, emotion, recommendations, based_on } = data;
          console.log(`💡 Sending AI recommendations to user ${user_id}`);
          console.log(`   Emotion: ${emotion}, Count: ${recommendations.length}`);

          // Send to user's personal room
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

      // Emotion Trends Update
      socket.on("emotionTrendsUpdate", async (data) => {
        try {
          const { user_id, trends, summary } = data;
          console.log(`📊 Emotion trends update for user ${user_id}`);

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

      // ==========================================
      // 🆕 BULK EMOTION NOTIFICATION (for group chats)
      // ==========================================
      socket.on("bulkEmotionAnalysis", async (data) => {
        try {
          const { message_id, conversation_id, participants_data } = data;
          console.log(`📊 Bulk emotion analysis for message ${message_id}`);
          console.log(`   Participants: ${participants_data.length}`);

          // Send emotion data to each participant
          participants_data.forEach((participantData) => {
            const { user_id, emotion, confidence, recommendations, is_sender } = participantData;
            
            io.to(`user:${user_id}`).emit("emotionAnalyzedWithRecommendations", {
              message_id,
              conversation_id,
              is_sender,
              emotion_data: {
                emotion,
                confidence,
              },
              recommendations: recommendations || [],
              timestamp: new Date(),
            });

            console.log(`   ✅ Sent to ${user_id}: ${emotion} (${(confidence * 100).toFixed(0)}%)`);
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
      // DISCONNECT
      // ==========================================
      socket.on("disconnect", () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);

        const disconnectedUser = onlineUsers.find(
          (user) => user.socketId === socket.id
        );
        if (disconnectedUser) {
          onlineUsers = onlineUsers.filter(
            (user) => user.socketId !== socket.id
          );
          console.log(`👤 User ${disconnectedUser.userId} disconnected`);
        }

        global.onlineUsers = onlineUsers;
        io.emit("getUsers", onlineUsers);
      });

      console.log("🤖 AI Emotion & Recommendation events registered");
    });

    // Next.js handler
    expressApp.use((req, res) => {
      return handler(req, res);
    });

    // Start server
    httpServer.listen(port, () => {
      console.log(`🚀 Server ready on http://${hostname}:${port}`);
      console.log(`📡 Socket.IO server running`);
      console.log(`✅ Global io instance available`);
      console.log(`🤖 AI Emotion Analysis: Enabled for ALL emotions`);
      console.log(`💡 AI Recommendations: Powered by HuggingFace`);
    });
  })
  .catch((err) => {
    console.error("❌ Error starting server:", err);
    process.exit(1);
  });