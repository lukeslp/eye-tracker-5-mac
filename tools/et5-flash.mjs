#!/usr/bin/env node
// et5-flash: upload Tobii's firmware to an Eye Tracker 5 sitting in its
// bootloader (2104:0102) so it re-enumerates as the runtime tracker
// (2104:0313). A port of tobiifree's assets/flash_firmware.c (GPL-3.0,
// Aetherall/tobiifree) to the Node `usb` package, so it runs on macOS with
// no libusb install.
//
//   node et5-flash.mjs status            read the bootloader's DFU status only
//   node et5-flash.mjs check <blob.bin> <header.bin>  validate a blob
//   node et5-flash.mjs flash <blob.bin> <header.bin> [trailer.bin]  flash it
//   node et5-flash.mjs trailer <platformservice> <blob.bin> <out.bin>
//                                         copy the 8-byte trailer Tobii stores
//                                         right after the blob
//
// 2026-11-02: a USB capture of Tobii's Windows upload showed it sends the
// blob followed by an 8-byte trailer (a 32-bit value, then the blob length)
// and announces blob + 8 as the size. Every Mac attempt without the trailer
// failed the manifest step with errNOTDONE. Passing a trailer file sends it
// the Windows way.
//
// The firmware is Tobii's. Supply it from your own copy of Tobii's
// installer; never commit or redistribute it.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';

const require = createRequire(import.meta.url);
// The Node `usb` package: from this folder's node_modules, or the path in ET5_USB.
const usb = require(process.env.ET5_USB ?? 'usb');

const VID = 0x2104, PID_FBL = 0x0102, PID_RUNTIME = 0x0313;
const TMO = 5000, CHUNK = 4095, EP_OUT = 0x04, WVALUE = 0x0008;
const CAAR_MAGIC = 0x98bc07fe;
// The 24-byte DNLOAD header is magic 0x5a6b22f3, 12 zero bytes, then the
// CRC-32 and byte length of the blob. tobiifree hard-codes the header of the
// firmware it captured; Tobii's service binary stores the header just ahead
// of each blob, so we build it from the blob and check it against that copy.
const HEADER_MAGIC = 0x5a6b22f3;
function headerFor(blob) {
  const h = Buffer.alloc(24);
  h.writeUInt32LE(HEADER_MAGIC, 0);
  h.writeUInt32LE(crc32(blob) >>> 0, 16);
  h.writeUInt32LE(blob.length, 20);
  return h;
}
const STATES = ['appIDLE', 'appDETACH', 'dfuIDLE', 'dfuDNLOAD-SYNC', 'dfuDNBUSY',
  'dfuDNLOAD-IDLE', 'dfuMANIFEST-SYNC', 'dfuMANIFEST', 'dfuMANIFEST-WAIT-RESET',
  'dfuUPLOAD-IDLE', 'dfuERROR'];
// The Windows capture uses wIndex 0 for GETSTATUS, CLRSTATUS and ABORT
// (the device answers either).
const STATUS_INDEX = Number(process.env.ET5_STATUS_INDEX ?? 0);
const S = { IDLE: 2, DNLOAD_SYNC: 3, MANIFEST_SYNC: 6, MANIFEST: 7, ERROR: 10 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');

function ctrl(dev, bm, req, val, idx, dataOrLen) {
  return new Promise((resolve, reject) =>
    dev.controlTransfer(bm, req, val, idx, dataOrLen, (err, data) =>
      err ? reject(err) : resolve(data)));
}

async function getStatus(dev, quiet = false) {
  const b = await ctrl(dev, 0xc1, 0x03, 0, STATUS_INDEX, 10);
  if (b.length < 10) throw new Error(`GETSTATUS short: ${b.length} bytes`);
  const st = {
    bStatus: b[0], poll: b[1] | (b[2] << 8) | (b[3] << 16), bState: b[4],
    iString: b[5], written: b.readUInt32LE(6),
  };
  if (!quiet) {
    console.log(`  status=${st.bStatus} state=${st.bState} (${STATES[st.bState] ?? '?'})` +
      ` poll=${st.poll}ms written=${st.written}  [${hex(b)}]`);
  }
  return st;
}

async function ctrlOut(dev, req, val, data) {
  await ctrl(dev, 0x41, req, val, 0, data ?? Buffer.alloc(0));
}

async function resetFromError(dev) {
  console.log('  reset: CLRSTATUS + ABORT');
  await ctrl(dev, 0x41, 0x04, 0, STATUS_INDEX, Buffer.alloc(0)).catch(() => {});
  await ctrl(dev, 0x41, 0x06, 0, STATUS_INDEX, Buffer.alloc(0)).catch(() => {});
  const st = await getStatus(dev);
  if (st.bState !== S.IDLE || st.bStatus !== 0) throw new Error('cannot recover to dfuIDLE');
}

function bulkWrite(ep, buf) {
  return new Promise((resolve, reject) =>
    ep.transfer(buf, (err) => (err ? reject(err) : resolve())));
}

async function bulkSend(ep, data) {
  const t0 = Date.now();
  let sent = 0, n = 0;
  while (sent < data.length) {
    const chunk = data.subarray(sent, Math.min(sent + CHUNK, data.length));
    await bulkWrite(ep, chunk);
    sent += chunk.length; n++;
    if (n % 32 === 0 || sent === data.length) {
      process.stdout.write(`\r  bulk ${sent} / ${data.length} (${(100 * sent / data.length).toFixed(1)}%)`);
    }
  }
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${n} chunks`);
}

async function waitManifest(dev) {
  let last = -1, stable = 0;
  for (let i = 0; i < 600; i++) {
    await sleep(700);
    let st;
    try { st = await getStatus(dev, true); } catch {
      console.log(`  poll ${i}: device dropped`); return;
    }
    if (st.bState !== last) {
      console.log(`  poll ${i} t=${(i * 0.7).toFixed(1)}s state=${st.bState} (${STATES[st.bState]}) status=${st.bStatus}`);
      last = st.bState; stable = 0;
    } else stable++;
    if (st.bState === S.MANIFEST || st.bState === S.IDLE) { console.log('  slot committed'); return 'committed'; }
    if (st.bState === S.ERROR) throw new Error('device went to dfuERROR');
    if (st.bState === S.MANIFEST_SYNC && stable >= 14) { console.log('  state 6 stable: slot stored'); return 'stored'; }
  }
  throw new Error(`timeout, stuck at state ${last}`);
}

async function flashSlot(dev, ep, blob, idx, header, trailer) {
  const payload = trailer ? Buffer.concat([blob, trailer]) : blob;
  console.log(`\n=== slot ${idx}: ${blob.length} bytes${trailer ? ' + 8-byte trailer' : ''} ===`);
  let st = await getStatus(dev);
  if (st.bState !== S.IDLE || st.bStatus !== 0) await resetFromError(dev);
  console.log('  DNLOAD header (24 bytes)');
  await ctrlOut(dev, 0x01, WVALUE, header);
  st = await getStatus(dev);
  if (st.bState !== S.DNLOAD_SYNC) throw new Error(`expected dfuDNLOAD-SYNC after header, got ${STATES[st.bState]}`);
  const size = Buffer.alloc(4); size.writeUInt32LE(payload.length);
  console.log(`  DNLOAD size=${payload.length}`);
  await ctrlOut(dev, 0x01, WVALUE, size);
  if (process.env.ET5_SYNC_BEFORE_BULK) await getStatus(dev); // leave dfuDNLOAD-SYNC first
  if (process.env.ET5_BULK_DELAY_MS) await sleep(Number(process.env.ET5_BULK_DELAY_MS));
  await bulkSend(ep, payload);
  await getStatus(dev); await getStatus(dev);
  console.log('  DNLOAD 0 (manifest trigger)');
  await ctrlOut(dev, 0x01, WVALUE);
  return waitManifest(dev);
}

function splitSlots(buf) {
  if (buf.length < 4 || buf.readUInt32LE(0) !== CAAR_MAGIC) throw new Error("blob doesn't start with the caar magic");
  const half = buf.length / 2;
  if (buf.length % 2 === 0 && buf.readUInt32LE(half) === CAAR_MAGIC) {
    return [buf.subarray(0, half), buf.subarray(half)];
  }
  return [buf];
}

function check(path, headerPath) {
  const buf = readFileSync(path);
  const slots = splitSlots(buf);
  console.log(`${path}: ${buf.length} bytes, ${slots.length} slot(s): ${slots.map((s) => s.length).join(' + ')}`);
  const headers = slots.map(headerFor);
  headers.forEach((h, i) => console.log(`slot ${i} header: ${hex(h)}`));
  let match = true;
  if (headerPath) {
    const stored = readFileSync(headerPath);
    match = headers.every((h) => h.equals(stored));
    console.log(`stored header:  ${hex(stored)}`);
    console.log(match ? 'built header matches the one Tobii stores with the blob' : 'MISMATCH with the stored header');
  } else {
    match = false;
    console.log('no stored header given; pass one to confirm the blob is intact');
  }
  return { slots, headers, match };
}

// The trailer is a 32-bit value Tobii computes (not a plain CRC of the image),
// then the blob length. It can only be copied from Tobii's own file.
function readTrailer(path, blob) {
  const t = readFileSync(path);
  if (t.length !== 8) throw new Error(`trailer must be 8 bytes, got ${t.length}`);
  if (t.readUInt32LE(4) !== blob.length) throw new Error(`trailer length field ${t.readUInt32LE(4)} != blob length ${blob.length}`);
  return t;
}

function extractTrailer(servicePath, blobPath, outPath) {
  const svc = readFileSync(servicePath), blob = readFileSync(blobPath);
  const at = svc.indexOf(blob);
  if (at < 0) throw new Error('blob not found inside the service binary');
  if (svc.indexOf(blob, at + 1) >= 0) throw new Error('blob found more than once; refusing to guess');
  const t = svc.subarray(at + blob.length, at + blob.length + 8);
  if (t.readUInt32LE(4) !== blob.length) throw new Error(`bytes after the blob don't end in its length (${hex(t)})`);
  const hdr = svc.subarray(at - 24, at);
  console.log(`blob at 0x${at.toString(16)}, header before it ${headerFor(blob).equals(hdr) ? 'matches' : 'DOES NOT match'}`);
  console.log(`trailer: ${hex(t)}`);
  writeFileSync(outPath, t);
  console.log(`wrote ${outPath}`);
}

function openFbl() {
  const dev = usb.findByIds(VID, PID_FBL);
  if (!dev) {
    if (usb.findByIds(VID, PID_RUNTIME)) throw new Error('tracker is already in runtime mode (2104:0313); nothing to flash');
    throw new Error('no tracker in bootloader mode (2104:0102) found');
  }
  dev.open();
  return dev;
}

async function main() {
  const [cmd, path] = process.argv.slice(2);
  const headerPath = process.argv[4], trailerPath = process.argv[5];
  if (cmd === 'trailer' && path && headerPath && trailerPath) { extractTrailer(path, headerPath, trailerPath); return; }
  if (cmd === 'check' && path) { check(path, headerPath); return; }
  if (cmd === 'status') {
    const dev = openFbl();
    try { dev.interface(0).claim(); await getStatus(dev); } finally { dev.close(); }
    return;
  }
  if (cmd === 'flash' && path) {
    const { slots, headers, match } = check(path, headerPath);
    if (!match) throw new Error('refusing to flash: the blob does not match the header Tobii stores with it');
    const trailers = slots.map((sl) => (trailerPath ? readTrailer(trailerPath, sl) : null));
    if (!trailerPath) console.log('warning: no trailer given; every Mac attempt without one failed with errNOTDONE');
    const dev = openFbl();
    if (!process.env.ET5_NO_RESET) await new Promise((r) => dev.reset(() => r())); // clear residual DFU state
    const iface = dev.interface(0);
    iface.claim();
    const ep = iface.endpoint(EP_OUT);
    ep.timeout = TMO;
    // Reset the bulk pipe's data toggle on both ends; a stale toggle makes the
    // device ACK and silently drop every packet.
    await new Promise((r) => ep.clearHalt((e) => { if (e) console.log(`  clearHalt: ${e.message}`); r(); }));
    try {
      // Windows writes the image twice, to slots A and B. A file holding one
      // copy is sent again when the first pass only stores it.
      const passes = slots.length === 2 ? [0, 1] : [0, 0];
      for (let n = 0; n < passes.length; n++) {
        const i = passes[n];
        const r = await flashSlot(dev, ep, slots[i], n, headers[i], trailers[i]);
        if (slots.length === 1 && r === 'committed') break;
      }
      console.log('\nsending post-flash commit (0x10 wValue=0x0004)');
      await ctrlOut(dev, 0x10, 0x0004).catch((e) => console.log(`  commit: ${e.message} (a drop is expected)`));
      console.log('flash complete; the tracker should re-enumerate as 2104:0313');
    } finally {
      try { iface.release(() => dev.close()); } catch { /* device already gone */ }
    }
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if (usb.findByIds(VID, PID_RUNTIME)) { console.log('confirmed: 2104:0313 is on the bus'); return; }
    }
    console.log('2104:0313 did not appear within 15 s; check with system_profiler SPUSBHostDataType');
    return;
  }
  console.error('usage: et5-flash.mjs status | check <blob.bin> [header.bin] | flash <blob.bin> <header.bin> [trailer.bin] | trailer <platformservice> <blob.bin> <out.bin>');
  process.exit(2);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
