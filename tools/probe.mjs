// Diagnostic: header + size, then a few bulk chunks with GETSTATUS between,
// to see whether the bootloader counts the bulk bytes. Ends with ABORT.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
// The Node `usb` package: from this folder's node_modules, or the path in ET5_USB.
const usb = require(process.env.ET5_USB ?? 'usb');
const [blobPath, hdrPath, mode] = process.argv.slice(2);
const blob = readFileSync(blobPath), hdr = readFileSync(hdrPath);
const dev = usb.findByIds(0x2104, 0x0102); dev.open();
const ctrl = (bm, r, v, i, d) => new Promise((ok, no) => dev.controlTransfer(bm, r, v, i, d, (e, x) => e ? no(e) : ok(x)));
const st = async (t) => { const b = await ctrl(0xc1, 3, 0, 0, 10); console.log(t, [...b].map(x=>x.toString(16).padStart(2,'0')).join(' ')); return b; };
const iface = dev.interface(0); iface.claim();
const ep = iface.endpoint(0x04); ep.timeout = 5000;
console.log('ep', ep.direction, ep.transferType, ep.descriptor.wMaxPacketSize);
const w = (b) => new Promise((ok, no) => ep.transfer(b, (e) => e ? no(e) : ok()));
let s = await st('start');
if (s[4] !== 2) { await ctrl(0x41, 4, 0, 0, Buffer.alloc(0)); await ctrl(0x41, 6, 0, 0, Buffer.alloc(0)); await st('reset'); }
await ctrl(0x41, 1, 8, 0, hdr); await st('hdr');
const size = Buffer.alloc(4); size.writeUInt32LE(blob.length);
await ctrl(0x41, 1, 8, 0, size); await st('size');
const chunk = mode === '4096' ? 4096 : mode === '512' ? 512 : 4095;
for (let i = 0; i < 4; i++) { await w(blob.subarray(i * chunk, (i + 1) * chunk)); await st(`after chunk ${i}`); }
await ctrl(0x41, 6, 0, 0, Buffer.alloc(0)).catch(e => console.log('abort', e.message)); await st('abort');
iface.release(() => dev.close());
