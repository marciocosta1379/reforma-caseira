// Navega o Chrome de debug para uma URL e espera renderizar, sem extrair nada.
// Uso: node scripts/ml-cdp-nav.mjs "<url>"
const PORT = process.env.CDP_PORT || 9222;
const url = process.argv[2];
if (!url) { console.error('Passe a URL.'); process.exit(1); }

const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
let page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!page) page = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const waiters = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg.result);
  } else if (msg.method) {
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].method === msg.method) { waiters[i].resolve(msg.params); waiters.splice(i, 1); }
    }
  }
});
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
const send = (method, params = {}) => new Promise((resolve) => { pending.set(++id, { resolve }); ws.send(JSON.stringify({ id, method, params })); });
const waitFor = (method, timeout = 20000) => new Promise((resolve) => {
  const w = { method, resolve };
  waiters.push(w);
  setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); resolve(null); }, timeout);
});

await send('Page.enable');
const loaded = waitFor('Page.loadEventFired', 25000);
await send('Page.navigate', { url });
await loaded;
await new Promise((r) => setTimeout(r, 3500));
console.log('navegado.');
ws.close();
process.exit(0);
