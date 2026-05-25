import { Server, Socket } from "socket.io";

type CallType = "audio" | "video";

interface CallRoom {
  roomId: string;
  conversationId: string;
  callType: CallType;
  hostId: string;
  hostName: string;
  members: Map<string, { name: string; joinedAt: number }>;
}

const callRooms = new Map<string, CallRoom>();
const userRoomIndex = new Map<string, Set<string>>();

let ioRef: Server | null = null;
let userSocketMapRef: { [key: string]: string[] } = {};

export function initCallSignaling(
  io: Server,
  userSocketMap: { [key: string]: string[] }
) {
  ioRef = io;
  userSocketMapRef = userSocketMap;
}

function emitToUser(userId: string, event: string, payload: unknown) {
  const sockets = userSocketMapRef[userId];
  if (!sockets || !ioRef) return;
  sockets.forEach((socketId) => {
    ioRef!.to(socketId).emit(event, payload);
  });
}

function emitToRoom(
  roomId: string,
  event: string,
  payload: unknown,
  excludeUserId?: string
) {
  const room = callRooms.get(roomId);
  if (!room) return;
  room.members.forEach((_member, memberId) => {
    if (memberId !== excludeUserId) {
      emitToUser(memberId, event, payload);
    }
  });
}

function addUserToRoomIndex(userId: string, roomId: string) {
  if (!userRoomIndex.has(userId)) {
    userRoomIndex.set(userId, new Set());
  }
  userRoomIndex.get(userId)!.add(roomId);
}

function removeUserFromRoomIndex(userId: string, roomId: string) {
  const rooms = userRoomIndex.get(userId);
  if (!rooms) return;
  rooms.delete(roomId);
  if (rooms.size === 0) userRoomIndex.delete(userId);
}

function leaveRoom(userId: string, roomId: string, userName?: string) {
  const room = callRooms.get(roomId);
  if (!room) return;

  room.members.delete(userId);
  removeUserFromRoomIndex(userId, roomId);

  emitToRoom(roomId, "call:user-left", {
    roomId,
    userId,
    userName: userName || "User",
    participants: Array.from(room.members.keys()),
  });

  if (room.members.size === 0) {
    callRooms.delete(roomId);
  }
}

export function handleCallUserDisconnect(userId: string) {
  const rooms = userRoomIndex.get(userId);
  if (!rooms) return;

  [...rooms].forEach((roomId) => {
    const room = callRooms.get(roomId);
    const member = room?.members.get(userId);
    leaveRoom(userId, roomId, member?.name);
  });
}

export function registerCallHandlers(socket: Socket, userId: string) {
  socket.on(
    "call:invite",
    ({
      roomId,
      conversationId,
      participants,
      callType,
      callerName,
    }: {
      roomId: string;
      conversationId: string;
      participants: string[];
      callType: CallType;
      callerName: string;
    }) => {
      if (!userId || !roomId || !participants?.length) return;

      const memberIds = [...new Set([...participants, userId])];

      if (!callRooms.has(roomId)) {
        callRooms.set(roomId, {
          roomId,
          conversationId,
          callType,
          hostId: userId,
          hostName: callerName,
          members: new Map([[userId, { name: callerName, joinedAt: Date.now() }]]),
        });
      }

      addUserToRoomIndex(userId, roomId);

      memberIds.forEach((participantId) => {
        if (participantId === userId) return;
        emitToUser(participantId, "call:incoming", {
          roomId,
          conversationId,
          callType,
          callerId: userId,
          callerName,
          participants: memberIds,
        });
      });
    }
  );

  socket.on(
    "call:accept",
    ({ roomId, userName }: { roomId: string; userName: string }) => {
      if (!userId || !roomId) return;

      const room = callRooms.get(roomId);
      if (!room) return;

      room.members.set(userId, { name: userName, joinedAt: Date.now() });
      addUserToRoomIndex(userId, roomId);

      emitToRoom(
        roomId,
        "call:user-joined",
        {
          roomId,
          userId,
          userName,
          participants: Array.from(room.members.entries()).map(([id, m]) => ({
            userId: id,
            name: m.name,
          })),
        },
        userId
      );

      emitToUser(userId, "call:accepted", {
        roomId,
        callType: room.callType,
        participants: Array.from(room.members.entries()).map(([id, m]) => ({
          userId: id,
          name: m.name,
        })),
      });
    }
  );

  socket.on(
    "call:reject",
    ({ roomId, userName }: { roomId: string; userName?: string }) => {
      if (!userId || !roomId) return;
      emitToRoom(roomId, "call:rejected", { roomId, userId, userName });
      leaveRoom(userId, roomId, userName);
    }
  );

  socket.on(
    "call:join",
    ({
      roomId,
      userName,
      conversationId,
      callType,
    }: {
      roomId: string;
      userName: string;
      conversationId?: string;
      callType?: CallType;
    }) => {
      if (!userId || !roomId) return;

      let room = callRooms.get(roomId);
      if (!room) {
        room = {
          roomId,
          conversationId: conversationId || roomId,
          callType: callType || "video",
          hostId: userId,
          hostName: userName,
          members: new Map(),
        };
        callRooms.set(roomId, room);
      }

      room.members.set(userId, { name: userName, joinedAt: Date.now() });
      addUserToRoomIndex(userId, roomId);

      emitToRoom(
        roomId,
        "call:user-joined",
        {
          roomId,
          userId,
          userName,
          participants: Array.from(room.members.entries()).map(([id, m]) => ({
            userId: id,
            name: m.name,
          })),
        },
        userId
      );

      emitToUser(userId, "call:joined", {
        roomId,
        callType: room.callType,
        participants: Array.from(room.members.entries()).map(([id, m]) => ({
          userId: id,
          name: m.name,
        })),
      });
    }
  );

  socket.on(
    "call:end",
    ({ roomId, userName }: { roomId: string; userName?: string }) => {
      if (!userId || !roomId) return;
      emitToRoom(roomId, "call:ended", { roomId, userId, userName });
      leaveRoom(userId, roomId, userName);
    }
  );

  socket.on(
    "webrtc:offer",
    ({
      roomId,
      toUserId,
      fromUserId,
      sdp,
    }: {
      roomId: string;
      toUserId: string;
      fromUserId: string;
      sdp: unknown;
    }) => {
      if (!fromUserId || fromUserId !== userId) return;
      emitToUser(toUserId, "webrtc:offer", { roomId, fromUserId, sdp });
    }
  );

  socket.on(
    "webrtc:answer",
    ({
      roomId,
      toUserId,
      fromUserId,
      sdp,
    }: {
      roomId: string;
      toUserId: string;
      fromUserId: string;
      sdp: unknown;
    }) => {
      if (!fromUserId || fromUserId !== userId) return;
      emitToUser(toUserId, "webrtc:answer", { roomId, fromUserId, sdp });
    }
  );

  socket.on(
    "webrtc:ice-candidate",
    ({
      roomId,
      toUserId,
      fromUserId,
      candidate,
    }: {
      roomId: string;
      toUserId: string;
      fromUserId: string;
      candidate: unknown;
    }) => {
      if (!fromUserId || fromUserId !== userId) return;
      emitToUser(toUserId, "webrtc:ice-candidate", { roomId, fromUserId, candidate });
    }
  );
}
