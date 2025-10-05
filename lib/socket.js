import { Server } from "socket.io";

let io;

export function initSocketIO(httpServer) {
  if (!io) {
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

    console.log("📡 Socket.IO server initialized");

    // Move your socket event handlers here
    io.on("connection", (socket) => {
      console.log(`🔌 New socket connection: ${socket.id}`);

      // Add your socket event handlers (e.g., addNewUsers, disconnect, etc.)
      socket.on("addNewUsers", (clerkUser) => {
        if (clerkUser) {
          const user_id = clerkUser._id;
          const existingUserIndex = global.onlineUsers.findIndex(
            (user) => user.userId === user_id
          );

          if (existingUserIndex !== -1) {
            global.onlineUsers[existingUserIndex].socketId = socket.id;
          } else {
            global.onlineUsers.push({
              userId: user_id,
              socketId: socket.id,
              profile: clerkUser,
            });
          }

          console.log(`👤 User ${user_id} connected with socket ${socket.id}`);
          console.log("Updated online users:", global.onlineUsers);
          io.emit("getUsers", global.onlineUsers);
        }
      });

      // Add other event handlers (callNotification, messageSent, etc.)
      // You can reuse the `handleSocketEvent` function here

      socket.on("disconnect", () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`);
        const disconnectedUser = global.onlineUsers.find(
          (user) => user.socketId === socket.id
        );
        if (disconnectedUser) {
          global.onlineUsers = global.onlineUsers.filter(
            (user) => user.socketId !== socket.id
          );
          console.log(`👤 User ${disconnectedUser.userId} disconnected`);
        }
        io.emit("getUsers", global.onlineUsers);
      });
    });
  }
  return io;
}

export function getSocketIO() {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initSocketIO first.");
  }
  return io;
}