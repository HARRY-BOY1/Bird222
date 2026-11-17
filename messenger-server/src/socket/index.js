const { Server } = require('socket.io');
const { z } = require('zod');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

const safeId = z.coerce.number().int().positive().refine(Number.isSafeInteger);
const sendSchema = z.object({ to: safeId, text: z.string().trim().min(1).max(4000) }).strict();
const messageIdSchema = z.object({ messageId: safeId }).strict();
const targetSchema = z.object({ to: safeId }).strict();
const callStartSchema = z.object({
  to: safeId,
  kind: z.enum(['audio', 'video']),
  callId: z.string().trim().min(8).max(64),
}).strict();
const callSignalSchema = z.object({
  to: safeId,
  callId: z.string().min(1).max(64),
  signal: z.object({ type: z.enum(['offer', 'answer', 'candidate']), data: z.unknown() }).strict(),
}).strict();
const callAnswerSchema = z.object({
  to: safeId,
  callId: z.string().min(1).max(64),
  accepted: z.boolean(),
}).strict();
const callEndSchema = z.object({ to: safeId, callId: z.string().min(1).max(64) }).strict();

function initializeSocket(httpServer, corsOrigin) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'] },
    maxHttpBufferSize: 1e6,
  });
  const online = new Map();
  const callSessions = new Map();

  io.use((socket, next) => {
    try {
      const header = socket.handshake.headers.authorization || '';
      const bearerToken = header.match(/^Bearer\s+(.+)$/i)?.[1];
      const token = socket.handshake.auth?.token || bearerToken;
      if (!token) return next(new Error('Authentication required'));
      const user = verifyToken(token);
      socket.user = { id: Number(user.sub), username: user.username };
      if (!Number.isSafeInteger(socket.user.id) || socket.user.id < 1) return next(new Error('Invalid token'));
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const { id, username } = socket.user;
    const room = `user:${id}`;
    const wasOffline = !online.has(id);
    online.set(id, (online.get(id) || 0) + 1);
    socket.join(room);
    if (wasOffline) io.emit('presence', { userId: id, username, status: 'online' });

    // Deliver messages saved while this user was offline; clients should still use history for older messages.
    const pending = db.prepare(`
      SELECT id, sender_id, receiver_id, text, status, created_at FROM messages
      WHERE receiver_id = ? AND status = 'sent' ORDER BY id
    `).all(id);
    if (pending.length) {
      const markDelivered = db.prepare("UPDATE messages SET status = 'delivered' WHERE id = ? AND receiver_id = ? AND status = 'sent'");
      const transaction = db.transaction((rows) => rows.forEach((message) => markDelivered.run(message.id, id)));
      transaction(pending);
      for (const message of pending) {
        message.status = 'delivered';
        socket.emit('message:new', message);
        io.to(`user:${message.sender_id}`).emit('message:status', { messageId: message.id, status: 'delivered' });
      }
    }

    socket.on('message:send', (payload, acknowledge) => {
      const input = sendSchema.safeParse(payload);
      if (!input.success) return respond(acknowledge, { error: 'Invalid message: to must be a user id and text must be 1–4000 characters' });
      if (input.data.to === id) {
        const result = db.prepare('INSERT INTO messages (sender_id, receiver_id, text) VALUES (?, ?, ?)').run(id, id, input.data.text);
        const message = db.prepare('SELECT id, sender_id, receiver_id, text, status, created_at FROM messages WHERE id = ?').get(result.lastInsertRowid);
        socket.emit('message:new', message);
        return respond(acknowledge, { message });
      }
      if (!db.prepare('SELECT id FROM users WHERE id = ?').get(input.data.to)) return respond(acknowledge, { error: 'Recipient not found' });

      const result = db.prepare('INSERT INTO messages (sender_id, receiver_id, text) VALUES (?, ?, ?)').run(id, input.data.to, input.data.text);
      const message = db.prepare('SELECT id, sender_id, receiver_id, text, status, created_at FROM messages WHERE id = ?').get(result.lastInsertRowid);
      if (online.has(input.data.to)) {
        db.prepare("UPDATE messages SET status = 'delivered' WHERE id = ?").run(message.id);
        message.status = 'delivered';
        io.to(`user:${input.data.to}`).emit('message:new', message);
        io.to(room).emit('message:status', { messageId: message.id, status: 'delivered' });
      }
      respond(acknowledge, { message });
    });

    socket.on('message:delivered', (payload, acknowledge) => updateStatus(socket, io, id, payload, 'delivered', acknowledge));
    socket.on('message:read', (payload, acknowledge) => updateStatus(socket, io, id, payload, 'read', acknowledge));

    socket.on('message:edit', (payload) => {
      const parsed = z.object({ messageId: safeId, text: z.string().trim().min(1).max(4000) }).strict().safeParse(payload);
      if (!parsed.success) return;
      const message = db.prepare('SELECT id, sender_id, receiver_id FROM messages WHERE id = ?').get(parsed.data.messageId);
      if (!message || message.sender_id !== id) return;
      db.prepare("UPDATE messages SET text = ?, edited_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(parsed.data.text, message.id);
      const event = { messageId: message.id, text: parsed.data.text, editedAt: new Date().toISOString() };
      io.to(room).emit('message:edited', event);
      if (message.receiver_id !== message.sender_id) io.to(`user:${message.receiver_id}`).emit('message:edited', event);
    });

    socket.on('message:react', (payload) => {
      const parsed = z.object({ messageId: safeId, reaction: z.string().trim().min(1).max(16).nullable() }).strict().safeParse(payload);
      if (!parsed.success) return;
      const message = db.prepare('SELECT id, sender_id, receiver_id FROM messages WHERE id = ?').get(parsed.data.messageId);
      if (!message || (message.sender_id !== id && message.receiver_id !== id)) return;
      db.prepare('UPDATE messages SET reaction = ? WHERE id = ?').run(parsed.data.reaction, message.id);
      const event = { messageId: message.id, reaction: parsed.data.reaction };
      io.to(room).emit('message:reaction', event);
      const peerId = message.sender_id === id ? message.receiver_id : message.sender_id;
      if (peerId !== id) io.to(`user:${peerId}`).emit('message:reaction', event);
    });

    socket.on('message:delete', (payload) => {
      const parsed = z.object({ messageId: safeId, mode: z.enum(['me', 'everyone']) }).strict().safeParse(payload);
      if (!parsed.success) return;
      const message = db.prepare('SELECT id, sender_id, receiver_id FROM messages WHERE id = ?').get(parsed.data.messageId);
      if (!message || message.sender_id !== id) return;
      if (parsed.data.mode === 'everyone') db.prepare("UPDATE messages SET deleted_for_all = 1, text = '' WHERE id = ?").run(message.id);
      else db.prepare('INSERT OR IGNORE INTO message_deletions (message_id, user_id) VALUES (?, ?)').run(message.id, id);
      const event = { messageId: message.id, mode: parsed.data.mode };
      io.to(room).emit('message:deleted', event);
      if (message.receiver_id !== id) io.to(`user:${message.receiver_id}`).emit('message:deleted', event);
    });

    socket.on('call:start', (payload) => {
      const input = callStartSchema.safeParse(payload);
      if (!input.success || input.data.to === id) return;
      if (!db.prepare('SELECT id FROM users WHERE id = ?').get(input.data.to)) return;
      if (callSessions.has(input.data.callId)) return;
      callSessions.set(input.data.callId, { from: id, to: input.data.to, status: 'ringing' });
      io.to(`user:${input.data.to}`).emit('call:incoming', {
        callId: input.data.callId, from: id, username, kind: input.data.kind,
      });
    });

    socket.on('call:signal', (payload) => {
      const input = callSignalSchema.safeParse(payload);
      if (!input.success || input.data.to === id) return;
      const session = callSessions.get(input.data.callId);
      const permitted = session && ((session.from === id && session.to === input.data.to && input.data.signal.type !== 'answer')
        || (session.to === id && session.from === input.data.to && input.data.signal.type !== 'offer'));
      if (!permitted) return;
      io.to(`user:${input.data.to}`).emit('call:signal', {
        callId: input.data.callId, from: id, signal: input.data.signal,
      });
    });

    socket.on('call:answer', (payload) => {
      const input = callAnswerSchema.safeParse(payload);
      if (!input.success || input.data.to === id) return;
      const session = callSessions.get(input.data.callId);
      if (!session || session.to !== id || session.from !== input.data.to) return;
      if (!input.data.accepted) callSessions.delete(input.data.callId);
      io.to(`user:${input.data.to}`).emit('call:answered', {
        callId: input.data.callId, from: id, accepted: input.data.accepted,
      });
    });

    socket.on('call:end', (payload) => {
      const input = callEndSchema.safeParse(payload);
      if (!input.success || input.data.to === id) return;
      const session = callSessions.get(input.data.callId);
      if (!session || (session.from !== id && session.to !== id)) return;
      const peerId = session.from === id ? session.to : session.from;
      if (peerId !== input.data.to) return;
      callSessions.delete(input.data.callId);
      io.to(`user:${peerId}`).emit('call:ended', { callId: input.data.callId, from: id });
    });

    socket.on('disconnect', () => {
      for (const [callId, session] of callSessions) {
        if (session.from !== id && session.to !== id) continue;
        const peerId = session.from === id ? session.to : session.from;
        callSessions.delete(callId);
        io.to(`user:${peerId}`).emit('call:ended', { callId, from: id });
      }
      const count = (online.get(id) || 1) - 1;
      if (count > 0) return online.set(id, count);
      online.delete(id);
      const lastSeen = new Date().toISOString();
      db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(lastSeen, id);
      io.emit('presence', { userId: id, username, status: 'offline', lastSeen });
    });
  });

  return io;
}

function respond(acknowledge, result) {
  if (typeof acknowledge === 'function') acknowledge(result);
}

function updateStatus(socket, io, userId, payload, status, acknowledge) {
  const input = messageIdSchema.safeParse(payload);
  if (!input.success) return respond(acknowledge, { error: 'messageId must be a positive safe integer' });
  const message = db.prepare('SELECT id, sender_id, receiver_id, status FROM messages WHERE id = ?').get(input.data.messageId);
  if (!message || message.receiver_id !== userId) return respond(acknowledge, { error: 'Message not found' });
  if (status === 'read' || message.status === 'sent') {
    db.prepare('UPDATE messages SET status = ? WHERE id = ?').run(status, message.id);
    io.to(`user:${message.sender_id}`).emit('message:status', { messageId: message.id, status });
  }
  respond(acknowledge, { ok: true, messageId: message.id, status: status === 'read' || message.status === 'sent' ? status : message.status });
}

function setTyping(io, socket, payload, isTyping) {
  const input = targetSchema.safeParse(payload);
  if (!input.success || input.data.to === socket.user.id) return;
  const target = input.data.to;
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(target)) return;
  io.to(`user:${target}`).emit(isTyping ? 'typing:start' : 'typing:stop', {
    userId: socket.user.id,
    username: socket.user.username,
  });
}

module.exports = { initializeSocket };
