(() => {
  let socket = null;
  const baseUrl = window.APP_CONFIG.serverUrl.replace(/\/$/, '');

  const SocketService = {
    connect(token, handlers = {}) {
      if (socket) socket.disconnect();
      if (typeof window.io !== 'function') throw new Error('مكتبة الاتصال الفوري غير متاحة.');
      socket = window.io(baseUrl, {
        auth: { token },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 800,
        reconnectionDelayMax: 8000,
        timeout: 10000,
      });
      socket.on('connect', () => handlers.connect?.());
      socket.on('disconnect', (reason) => handlers.disconnect?.(reason));
      socket.on('connect_error', (error) => handlers.error?.(error));
      for (const event of ['message:new', 'message:status', 'typing:start', 'typing:stop', 'presence', 'message:edited', 'message:deleted', 'message:reaction', 'call:incoming', 'call:signal', 'call:answered', 'call:ended']) {
        socket.on(event, (payload) => handlers[event]?.(payload));
      }
      return socket;
    },
    send(to, text) {
      return new Promise((resolve, reject) => {
        if (!socket?.connected) return reject(new Error('الاتصال غير متاح حالياً. حاول بعد عودة الاتصال.'));
        socket.timeout(8000).emit('message:send', { to, text }, (error, response) => {
          if (error) return reject(new Error('لم يصل تأكيد الرسالة. تحقق من المحادثة قبل إعادة الإرسال.'));
          if (response?.error) return reject(new Error(response.error));
          resolve(response.message);
        });
      });
    },
    delivered(messageId) { if (socket?.connected) socket.emit('message:delivered', { messageId }); },
    read(messageId) { if (socket?.connected) socket.emit('message:read', { messageId }); },
    editMessage(messageId, text) { if (socket?.connected) socket.emit('message:edit', { messageId, text }); },
    deleteMessage(messageId, mode) { if (socket?.connected) socket.emit('message:delete', { messageId, mode }); },
    reactToMessage(messageId, reaction) { if (socket?.connected) socket.emit('message:react', { messageId, reaction }); },
    typingStart(to) { if (socket?.connected) socket.emit('typing:start', { to }); },
    typingStop(to) { if (socket?.connected) socket.emit('typing:stop', { to }); },
    callStart(to, kind, callId) { if (socket?.connected) socket.emit('call:start', { to, kind, callId }); },
    callSignal(to, callId, signal) { if (socket?.connected) socket.emit('call:signal', { to, callId, signal }); },
    callAnswer(to, callId, accepted) { if (socket?.connected) socket.emit('call:answer', { to, callId, accepted }); },
    callEnd(to, callId) { if (socket?.connected) socket.emit('call:end', { to, callId }); },
    disconnect() { if (socket) { socket.removeAllListeners(); socket.disconnect(); socket = null; } },
    get connected() { return Boolean(socket?.connected); },
  };
  window.SocketService = SocketService;
})();
