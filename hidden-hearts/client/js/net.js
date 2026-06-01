// WebSocket client + REST helpers.

export class Net {
  constructor(onMsg) { this.onMsg = onMsg; this.ws = null; this.clientId = null; }
  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      this.ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === 'hello') this.clientId = m.clientId;
        this.onMsg(m);
      };
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onclose = () => this.onMsg({ type: 'closed' });
    });
  }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() { try { this.ws && this.ws.close(); } catch {} this.ws = null; }
}

export const api = {
  async post(path, body, token) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  },
  async get(path, token) {
    const r = await fetch(path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  },
};
