const PREFIX = "bird.";

export const LS = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* تجاهل */ }
  },
  del(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* تجاهل */ }
  }
};
