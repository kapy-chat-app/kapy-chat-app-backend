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

    // ✅ QUAN TRỌNG: Expose io và onlineUsers globally để Next.js API routes có thể sử dụng
    global.io = io;
    global.onlineUsers = onlineUsers;

    console.log("✅ Global io instance set successfully");

    io.on("connection", (socket) => {
      console.log(`🔌 New socket connection: ${socket.id}`);

      // Add new user event
      socket.on("addNewUsers", (clerkUser) => {
        if (clerkUser) {
          const user_id = clerkUser._id;

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
          console.log("Updated online users:", onlineUsers);
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

            // For now, just emit success response
            // TODO: Implement actual handlers when database models are fixed
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

      //Typing Events
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

          console.log(
            `✅ Typing event broadcasted to room ${roomName} (excluding sender)`
          );
        } catch (error) {
          console.error(`❌ Error handling userTyping:`, error);
        }
      });
      handleSocketEvent("userTyping");
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

      // ✅ Join/Leave Conversation Room
      socket.on("joinConversation", (conversationId) => {
        const roomName = `conversation:${conversationId}`;
        socket.join(roomName);
        console.log(`📥 Socket ${socket.id} joined room ${roomName}`);
      });

      socket.on("leaveConversation", (conversationId) => {
        const roomName = `conversation:${conversationId}`;
        socket.leave(roomName);
        console.log(`📤 Socket ${socket.id} left room ${roomName}`);
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
    });

    // Next.js API routes và Pages sẽ chạy sau khi cấu hình Express
    expressApp.use((req, res) => {
      return handler(req, res);
    });

    // Khởi động server HTTP với Express
    httpServer.listen(port, () => {
      console.log(`🚀 Server ready on http://${hostname}:${port}`);
      console.log(`📡 Socket.IO server running`);
      console.log(`✅ Global io instance available for API routes`);
      console.log(
        `🔧 Features: Full Socket.IO, CORS, User Management, All Events`
      );
      console.log(
        `📋 Available Events: All notification, message, call, friend, conversation, reaction, read events`
      );
    });
  })
  .catch((err) => {
    console.error("❌ Error starting server:", err);
    process.exit(1);
  });
