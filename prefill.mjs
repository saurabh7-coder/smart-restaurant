import WebSocket from 'ws';
import fs from 'fs';
const SHOT = process.env.SHOT;
const t = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.once('open', r));
let id = 0; const p = new Map();
ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } });
const send = (m, params = {}) => new Promise((res) => { const i = ++id; p.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${SHOT}/${n}.png`, Buffer.from(r.result.data, 'base64')); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 950, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5173/' }); await wait(4000);
await ev(`[...document.querySelectorAll('.guest-pills button')].find(b=>b.textContent.trim()==='4')?.click()`);
await wait(1600);
const chosen = await ev(`[...document.querySelectorAll('.slot-pills button')][1]?.textContent.trim()`);
await ev(`[...document.querySelectorAll('.slot-pills button')][1]?.click()`);
await wait(3000);

console.log('  picked in hero:', chosen);
console.log('  url            :', await ev(`location.search`));
console.log('  selected slot  :', await ev(`document.querySelector('.slot-grid .slot[aria-pressed="true"]')?.textContent?.trim() ?? 'NONE'`));
console.log('  guests field   :', await ev(`document.querySelector('#guests')?.value ?? 'n/a'`));
await shot('prefilled-reservation');
ws.close();
