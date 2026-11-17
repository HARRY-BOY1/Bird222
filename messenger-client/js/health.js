// Periodic connection indicator; actual reconnection is handled by Socket.IO.
(() => {
  const TOKEN_KEY = 'messenger.jwt';
  window.setInterval(() => {
    if (window.UI?.els?.connectionStatus && !window.UI.els.messengerScreen.hidden) {
      const connected = window.SocketService?.connected;
      if (!connected) window.UI.setConnection('error', 'انقطع الاتصال — نحاول مجدداً...');
    }
    void TOKEN_KEY;
  }, 5000);
})();
