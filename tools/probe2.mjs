// Diagnostic: does the bootloader answer on bulk IN 0x82 during a download?
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
// The Node `usb` package: from this folder's node_modules, or the path in ET5_USB.
const usb = require(process.env.ET5_USB ?? 'usb');
const [blobPath, hdrPath] = process.argv.slice(2);
const blob = readFileSync(blobPath), hdr = readFileSync(hdrPath);
const dev = usb.findByIds(0x2104, 0x0102); dev.open();
const ctrl = (bm, r, v, i, d) => new Promise((ok, no) => dev.controlTransfer(bm, r, v, i, d, (e, x) => e ? no(e) : ok(x)));
const st = async (t) => { const b = await ctrl(0xc1, 3, 0, 0, 10); console.log(t, [...b].map(x=>x.toString(16).padStart(2,'0')).join(' ')); return b; };
const iface = dev.interface(0); iface.claim();
const out = iface.endpoint(0x04), inn = iface.endpoint(0x82); out.timeout = 3000; inn.timeout = 500;
const w = (b) => new Promise((ok, no) => out.transfer(b, (e) => e ? no(e) : ok()));
const r = () => new Promise((ok) => inn.transfer(512, (e, d) => ok(e ? `IN: ${e.message}` : `IN ${d.length}: ${d.toString('hex').slice(0, 64)}`)));
let s = await st('start');
if (s[4] !== 2) { await ctrl(0x41, 4, 0, 0, Buffer.alloc(0)); await ctrl(0x41, 6, 0, 0, Buffer.alloc(0)); await st('reset'); }
console.log(await r());
await ctrl(0x41, 1, 8, 0, hdr); await st('hdr'); console.log(await r());
const size = Buffer.alloc(4); size.writeUInt32LE(blob.length);
await ctrl(0x41, 1, 8, 0, size); await st('size'); console.log(await r());
for (let i = 0; i < 3; i++) { await w(blob.subarray(i * 4095, (i + 1) * 4095)); console.log(await r()); await st(`chunk ${i}`); }
await ctrl(0x41, 6, 0, 0, Buffer.alloc(0)).catch(e => console.log('abort', e.message)); await st('abort');
iface.release(() => dev.close());
