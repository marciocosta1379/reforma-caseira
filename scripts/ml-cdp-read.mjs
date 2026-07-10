// Lê a página ATUAL do Chrome de debug (sem navegar) com a extração do ml-cdp.
// Uso: node scripts/ml-cdp-read.mjs
// Fluxo colaborativo: o usuário navega no Chrome (porta 9222) até um produto
// do ML e este script extrai nome/preço/nota/imagem do que está na tela.

const PORT = process.env.CDP_PORT || 9222;

const EXTRACT = `(() => {
  const meta = (sel, attr = 'content') => { const el = document.querySelector(sel); return el ? el.getAttribute(attr) : null; };
  const isVerification = location.href.includes('account-verification') ||
    !!document.querySelector('form[action*="verification" i]');
  const h1 = document.querySelector('h1.ui-pdp-title') || document.querySelector('h1');
  let price = meta('meta[itemprop="price"]');
  if (!price) {
    const containers = ['.ui-pdp-price__second-line', '.ui-pdp-price', '#price'];
    for (const sel of containers) {
      const box = document.querySelector(sel);
      if (!box) continue;
      const line = box.querySelector('.andes-money-amount__fraction');
      if (line) {
        const cents = box.querySelector('.andes-money-amount__cents');
        price = line.innerText.replace(/\\./g, '') + '.' + (cents ? cents.innerText : '00');
        break;
      }
    }
  }
  const ratingEl = document.querySelector('.ui-pdp-review__rating');
  const amountEl = document.querySelector('.ui-pdp-review__amount');
  let image = null;
  const galleryImg = document.querySelector('.ui-pdp-gallery__figure img');
  if (galleryImg) {
    const srcset = galleryImg.getAttribute('srcset') || '';
    const candidates = srcset.split(',').map(s => s.trim().split(/\\s+/)[0]).filter(Boolean);
    image = candidates.find(u => u.includes('-F.')) || candidates[candidates.length - 1] || galleryImg.src;
  }
  return {
    url: location.href.split('?')[0],
    isVerification,
    name: h1 ? h1.innerText.trim() : (meta('meta[property="og:title"]') || document.title),
    price: price ? parseFloat(price) : null,
    rating: ratingEl ? parseFloat(ratingEl.innerText.replace(',', '.')) : null,
    reviews: amountEl ? amountEl.innerText.trim() : null,
    image,
  };
})()`;

const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!page) {
  console.error('Nenhuma página aberta no Chrome de debug.');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve } = pending.get(msg.id);
    pending.delete(msg.id);
    resolve(msg.result);
  }
});
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
const send = (method, params = {}) =>
  new Promise((resolve) => {
    pending.set(++id, { resolve });
    ws.send(JSON.stringify({ id, method, params }));
  });

const { result } = await send('Runtime.evaluate', { expression: EXTRACT, returnByValue: true });
console.log(JSON.stringify(result.value, null, 2));
ws.close();
process.exit(0);
