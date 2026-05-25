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

function normalizeId(id: unknown): string {
  return id == null ? "" : String(id);
}

export function registerCallHandlers(socket: Socket, userId: string) {
  const selfId = normalizeId(userId);
  if (!selfId || selfId === "undefined") return;

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
      if (!selfId || !roomId || !participants?.length) return;

      const memberIds = [
        ...new Set([...participants.map(normalizeId), selfId].filter(Boolean)),
      ];

      if (!callRooms.has(roomId)) {
        callRooms.set(roomId, {
          roomId,
          conversationId,
          callType,
          hostId: selfId,
          hostName: callerName,
          members: new Map([[selfId, { name: callerName, joinedAt: Date.now() }]]),
        });
      }

      addUserToRoomIndex(selfId, roomId);

      memberIds.forEach((participantId) => {
        if (participantId === selfId) return;
        emitToUser(participantId, "call:incoming", {
          roomId,
          conversationId,
          callType,
          callerId: selfId,
          callerName,
          participants: memberIds,
        });
      });
    }
  );

  socket.on(
    "call:accept",
    ({ roomId, userName }: { roomId: string; userName: string }) => {
      if (!selfId || !roomId) return;

      const room = callRooms.get(roomId);
      if (!room) {
        emitToUser(selfId, "call:ended", { roomId, reason: "room_not_found" });
        return;
      }

      room.members.set(selfId, { name: userName, joinedAt: Date.now() });
      addUserToRoomIndex(selfId, roomId);

      emitToRoom(
        roomId,
        "call:user-joined",
        {
          roomId,
          userId: selfId,
          userName,
          participants: Array.from(room.members.entries()).map(([id, m]) => ({
            userId: id,
            name: m.name,
          })),
        },
        selfId
      );

      emitToUser(selfId, "call:accepted", {
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
      if (!selfId || !roomId) return;
      emitToRoom(roomId, "call:rejected", { roomId, userId: selfId, userName });
      leaveRoom(selfId, roomId, userName);
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
      if (!selfId || !roomId) return;

      let room = callRooms.get(roomId);
      if (!room) {
        room = {
          roomId,
          conversationId: conversationId || roomId,
          callType: callType || "video",
          hostId: selfId,
          hostName: userName,
          members: new Map(),
        };
        callRooms.set(roomId, room);
      }

      room.members.set(selfId, { name: userName, joinedAt: Date.now() });
      addUserToRoomIndex(selfId, roomId);

      emitToRoom(
        roomId,
        "call:user-joined",
        {
          roomId,
          userId: selfId,
          userName,
          participants: Array.from(room.members.entries()).map(([id, m]) => ({
            userId: id,
            name: m.name,
          })),
        },
        selfId
      );

      emitToUser(selfId, "call:joined", {
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
      if (!selfId || !roomId) return;
      emitToRoom(roomId, "call:ended", { roomId, userId: selfId, userName });
      leaveRoom(selfId, roomId, userName);
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
      const from = normalizeId(fromUserId);
      const to = normalizeId(toUserId);
      if (!from || from !== selfId || !to) return;
      emitToUser(to, "webrtc:offer", { roomId, fromUserId: from, sdp });
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
      const from = normalizeId(fromUserId);
      const to = normalizeId(toUserId);
      if (!from || from !== selfId || !to) return;
      emitToUser(to, "webrtc:answer", { roomId, fromUserId: from, sdp });
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
      const from = normalizeId(fromUserId);
      const to = normalizeId(toUserId);
      if (!from || from !== selfId || !to) return;
      emitToUser(to, "webrtc:ice-candidate", { roomId, fromUserId: from, candidate });
    }
  );
}
