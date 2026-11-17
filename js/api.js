(() => {
  const baseUrl = window.APP_CONFIG.serverUrl.replace(/\/$/, '');
  let token = null;

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new Error('تعذّر الاتصال بالخادم. تأكد أنه يعمل وأن إعدادات الشبكة صحيحة.');
    }
    let data = {};
    try { data = await response.json(); } catch { /* Handle non-JSON server failures below. */ }
    if (!response.ok) {
      const error = new Error(data.error || `حدث خطأ (${response.status})`);
      error.status = response.status;
      error.details = data.details;
      throw error;
    }
    return data;
  }

  const API = {
    setToken(value) { token = value || null; },
    async register(username, password) { return request('/api/register', { method: 'POST', body: { username, password } }); },
    async login(username, password) { return request('/api/login', { method: 'POST', body: { username, password } }); },
    async contacts() { const data = await request('/api/contacts'); return { contacts: data.contacts, prefs: data.prefs || {} }; },
    async addContact(contactId) { return (await request('/api/contacts', { method: 'POST', body: { contactId } })).contact; },
    async searchUsers(query) { return (await request(`/api/users/search?q=${encodeURIComponent(query)}`)).users; },
    async getUser(id) { return (await request(`/api/users/${encodeURIComponent(id)}`)).user; },
    async updateProfile(data) { return (await request('/api/profile', { method: 'PATCH', body: data })).user; },
    async getPrefs() { return (await request('/api/prefs')).prefs; },
    async setPref(peerId, changes) { return request('/api/prefs', { method: 'POST', body: { peerId, ...changes } }); },
    async getDrafts() { return (await request('/api/drafts')).drafts; },
    async saveDraft(peerId, text) { return request('/api/drafts', { method: 'PUT', body: { peerId, text } }); },
    async savedMessages() { return request('/api/saved-messages'); },
    async editMessage(id, text) { return (await request(`/api/messages/${id}/edit`, { method: 'POST', body: { text } })).message; },
    async deleteMessage(id, mode = 'me') { return request(`/api/messages/${id}/delete`, { method: 'POST', body: { mode } }); },
    async reactToMessage(id, reaction) { return request(`/api/messages/${id}/react`, { method: 'POST', body: { reaction } }); },
    async messages(userId, before) {
      const cursor = before ? `?before=${encodeURIComponent(before)}` : '';
      return request(`/api/messages/${encodeURIComponent(userId)}${cursor}`);
    },
  };
  window.API = API;
})();
