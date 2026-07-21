// Verifica se uma página de produto ML é de "Loja oficial" (não elegível pro
// programa de afiliados). Reusa o mesmo padrão de conexão do ml-cdp.mjs.
const PORT = process.env.CDP_PORT || 9222;
const urls = process.argv.slice(2);

const EXTRACT = `(() => {
  const bodyTxt = document.body.innerText;
  const isOfficial = /loja oficial/i.test(bodyTxt);
  const h1 = document.querySelector('h1.ui-pdp-title') || document.querySelector('h1');
  return { name: h1 ? h1.innerText.trim() : document.title, isOfficial };
})()`;

async function getPageTarget() {
  const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
  let page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) page = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  return page.webSocketDebuggerUrl;
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method) {
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].method === msg.method) { waiters[i].resolve(msg.params); waiters.splice(i, 1); }
      }
    }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const waitFor = (method, timeout = 20000) => new Promise((resolve) => {
    const w = { method, resolve };
    waiters.push(w);
    setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); resolve(null); }, timeout);
  });
  return { ready, send, waitFor, close: () => ws.close() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const wsUrl = await getPageTarget();
  const client = cdp(wsUrl);
  await client.ready;
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  const results = [];
  for (const url of urls) {
    const loaded = client.waitFor('Page.loadEventFired', 25000);
    await client.send('Page.navigate', { url });
    await loaded;
    await sleep(3500);
    const { result } = await client.send('Runtime.evaluate', { expression: EXTRACT, returnByValue: true });
    const v = result.value || {};
    results.push({ url, ...v });
    console.error(`  ${v.isOfficial ? 'LOJA OFICIAL (evitar)' : 'ok, não é oficial'}: ${(v.name || '').slice(0, 60)}`);
  }
  client.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
