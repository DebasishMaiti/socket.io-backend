import "../config/env";
import { Server } from "socket.io";
import http from "http";
import express from "express";
import { getAllowedOrigins } from "../config/cors";

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: getAllowedOrigins(),
    methods: ["GET", "POST"],
    credentials: true,
  },
  allowEIO3: true,
  transports: ["websocket", "polling"],
});

export const getReceiverSocketId = (receiverId: string) => {
  // Returns the first socket ID found for this user
  return userSocketMap[receiverId]?.[0];
};

// Map to store multiple socket IDs per user: {userId: [socketId1, socketId2]}
export const userSocketMap: { [key: string]: string[] } = {};

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId as string;

  if (userId && userId !== "undefined") {
    if (!userSocketMap[userId]) {
      userSocketMap[userId] = [];
    }
    userSocketMap[userId].push(socket.id);
    if (process.env.NODE_ENV !== "production") {
      console.log(`User ${userId} connected (Total sockets: ${userSocketMap[userId].length})`);
    }
  }

  // Send the list of online users to all clients
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Typing events
  socket.on("typing", ({ conversationId, participants, senderName }) => {
    participants.forEach((participantId: string) => {
      if (participantId !== userId) {
        const userSockets = userSocketMap[participantId];
        if (userSockets) {
          userSockets.forEach((socketId) => {
            io.to(socketId).emit("userTyping", { conversationId, userId, senderName });
          });
        }
      }
    });
  });

  socket.on("stopTyping", ({ conversationId, participants }) => {
    participants.forEach((participantId: string) => {
      if (participantId !== userId) {
        const userSockets = userSocketMap[participantId];
        if (userSockets) {
          userSockets.forEach((socketId) => {
            io.to(socketId).emit("userStoppedTyping", { conversationId, userId });
          });
        }
      }
    });
  });

  // Recording events
  socket.on("recording", ({ conversationId, participants, senderName }) => {
    participants.forEach((participantId: string) => {
      if (participantId !== userId) {
        const userSockets = userSocketMap[participantId];
        if (userSockets) {
          userSockets.forEach((socketId) => {
            io.to(socketId).emit("userRecording", { conversationId, userId, senderName });
          });
        }
      }
    });
  });

  socket.on("stopRecording", ({ conversationId, participants }) => {
    participants.forEach((participantId: string) => {
      if (participantId !== userId) {
        const userSockets = userSocketMap[participantId];
        if (userSockets) {
          userSockets.forEach((socketId) => {
            io.to(socketId).emit("userStoppedRecording", { conversationId, userId });
          });
        }
      }
    });
  });

  socket.on("disconnect", () => {
    if (userId && userId !== "undefined" && userSocketMap[userId]) {
      userSocketMap[userId] = userSocketMap[userId].filter(id => id !== socket.id);
      if (process.env.NODE_ENV !== "production") {
        console.log(`Socket ${socket.id} for User ${userId} disconnected`);
      }

      if (userSocketMap[userId].length === 0) {
        delete userSocketMap[userId];
        if (process.env.NODE_ENV !== "production") {
          console.log(`User ${userId} is now fully offline`);
        }
      }
    }
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { app, io, server };
