import "./config/env";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import connectDB from "./db/connectDB";
import { getAllowedOrigins } from "./config/cors";
import { getUploadBaseDir } from "./utils/paths";

import authRoutes from "./auth/auth.routes";
import messageRoutes from "./message/message.routes";
import userRoutes from "./user/user.routes";

import { app, server } from "./sockets/socket";

const PORT = parseInt(process.env.PORT || "5000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const isVercel = !!process.env.VERCEL;

app.use(cors({
  origin: getAllowedOrigins(),
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static("public"));
app.use("/uploads", express.static(getUploadBaseDir()));

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err: any) {
    res.status(500).json({ error: "Database connection failed", details: err.message });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/users", userRoutes);

app.get("/", (_req, res) => {
  res.send("Chat App API is running...");
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

async function startServer() {
  await connectDB();
  server.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

// Vercel: export app only (serverless). Render & local: start HTTP + Socket.IO server.
if (!isVercel) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

export default app;
