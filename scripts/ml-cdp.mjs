// Coletor de dados do Mercado Livre via Chrome DevTools Protocol (CDP).
//
// Por que: o ML bloqueia acesso automatizado (WebFetch/curl caem no gate
// gz/account-verification; a API /items passou a responder 404/403 para app
// tokens). Um Chrome REAL passa normal. E o Chrome MCP trava porque espera
// document_idle, que páginas do ML nunca atingem (conexões abertas contínuas)
// — aqui usamos Page.loadEventFired + espera fixa, como o petz-cdp.mjs.
//
// USO (uma vez): abra o Chrome com porta de debug:
//   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=<temp> --no-first-run about:blank
// Depois:
//   node scripts/ml-cdp.mjs "https://www.mercadolivre.com.br/..../p/MLB..." ...
//
// Saída: JSON por URL com { url, name, price, rating, reviews, image }.
// image = variante -F.webp (1200w) do srcset da galeria — NUNCA usar .src puro
// (pode ser placeholder -R.webp de ~300 bytes).

const PORT = process.env.CDP_PORT || 9222;
const urls = process.argv.slice(2);

if (!urls.length) {
  console.error('Passe ao menos uma URL. Ex.: node scripts/ml-cdp.mjs "https://www.mercadolivre.com.br/.../p/MLB..."');
  process.exit(1);
}

// Expressão executada DENTRO da página (lê só o que já está renderizado).
const EXTRACT = `(() => {
  const meta = (sel, attr = 'content') => { const el = document.querySelector(sel); return el ? el.getAttribute(attr) : null; };

  // Detecta o gate anti-bot / página de verificação
  const isVerification = location.href.includes('account-verification') ||
    !!document.querySelector('form[action*="verification" i]');

  const h1 = document.querySelector('h1.ui-pdp-title') || document.querySelector('h1');

  // Preço: itemprop é o mais confiável; fallbacks pro bloco andes da PDP
  // (catálogo com variações às vezes não tem o meta itemprop)
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

  // Nota + nº de avaliações do header da PDP
  const ratingEl = document.querySelector('.ui-pdp-review__rating');
  const amountEl = document.querySelector('.ui-pdp-review__amount');

  // Imagem: srcset da galeria, preferir a variante -F.webp (1200w)
  let image = null;
  const galleryImg = document.querySelector('.ui-pdp-gallery__figure img');
  if (galleryImg) {
    const srcset = galleryImg.getAttribute('srcset') || '';
    const candidates = srcset.split(',').map(s => s.trim().split(/\\s+/)[0]).filter(Boolean);
    image = candidates.find(u => u.includes('-F.')) || candidates[candidates.length - 1] || galleryImg.src;
  }

  return {
    url: location.href,
    isVerification,
    name: h1 ? h1.innerText.trim() : (meta('meta[property="og:title"]') || document.title),
    price: price ? parseFloat(price) : null,
    rating: ratingEl ? parseFloat(ratingEl.innerText.replace(',', '.')) : null,
    reviews: amountEl ? amountEl.innerText.trim() : null,
    image,
  };
})()`;

async function getPageTarget() {
  const list = await (await fetch(`http://localhost:${PORT}/json`)).json();
  let page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) {
    page = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  }
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
        if (waiters[i].method === msg.method) {
          waiters[i].resolve(msg.params);
          waiters.splice(i, 1);
        }
      }
    }
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const waitFor = (method, timeout = 20000) =>
    new Promise((resolve) => {
      const w = { method, resolve };
      waiters.push(w);
      setTimeout(() => {
        const i = waiters.indexOf(w);
        if (i >= 0) waiters.splice(i, 1);
        resolve(null);
      }, timeout);
    });
  return { ready, send, waitFor, close: () => ws.close() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let wsUrl;
  try {
    wsUrl = await getPageTarget();
  } catch (e) {
    console.error(`\nNão consegui falar com o Chrome em localhost:${PORT}.`);
    console.error('Abra o Chrome com: --remote-debugging-port=9222\n');
    console.error('Detalhe:', e.message);
    process.exit(1);
  }

  const client = cdp(wsUrl);
  await client.ready;
  await client.send('Page.enable');
  await client.send('Runtime.enable');

  const results = [];
  for (const url of urls) {
    const loaded = client.waitFor('Page.loadEventFired', 25000);
    await client.send('Page.navigate', { url });
    await loaded;
    await sleep(3500); // respiro pro JS/preço renderizar
    const { result } = await client.send('Runtime.evaluate', {
      expression: EXTRACT,
      returnByValue: true,
      awaitPromise: true,
    });
    const v = result.value || {};
    results.push(v);
    console.error(`  ${v.isVerification ? 'BLOQUEADO (verificação)' : 'ok'}: ${(v.name || '').slice(0, 60)}`);
  }

  client.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error('Erro:', e.message);
  process.exit(1);
});
