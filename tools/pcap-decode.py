#!/usr/bin/env python3
"""Decode a USBPcap capture (.pcap, link type 249) of an Eye Tracker 5
activation into a readable timeline, and compare the bulk upload with a
firmware blob. Standard library only.

  python3 -I pcap-decode.py <capture.pcap> [firmware-blob.bin]
"""
import struct, sys, zlib

DFU = {0: 'DETACH', 1: 'DNLOAD', 2: 'UPLOAD', 3: 'GETSTATUS', 4: 'CLRSTATUS',
       5: 'GETSTATE', 6: 'ABORT'}


def packets(path):
    f = open(path, 'rb').read()
    if struct.unpack_from('<I', f, 20)[0] != 249:
        sys.exit('not a USBPcap capture (link type 249)')
    off = 24
    while off < len(f):
        ts, tu, incl, _ = struct.unpack_from('<IIII', f, off)
        off += 16
        d = f[off:off + incl]
        off += incl
        hl, irp, status, func, info, bus, dev, ep, xfer, dlen = \
            struct.unpack_from('<HQIHBHHBBI', d, 0)
        yield dict(t=ts + tu / 1e6, status=status, func=func, back=info & 1,
                   dev=dev, ep=ep, xfer=xfer, extra=d[27:hl], data=d[hl:])


def main():
    pk = list(packets(sys.argv[1]))
    t0 = pk[0]['t']
    print(f'{len(pk)} packets over {pk[-1]["t"] - t0:.1f} s')
    bulk, run = bytearray(), None

    def flush():
        nonlocal run
        if run:
            print(f'{run[0]:8.3f} BULK OUT ep 0x04: {run[1]} transfers, {run[2]} bytes')
            run = None

    for p in pk:
        t = p['t'] - t0
        if p['xfer'] == 3 and p['ep'] == 0x04:
            if not p['back']:
                bulk += p['data']
                run = run or [t, 0, 0]
                run[1] += 1
                run[2] += len(p['data'])
            continue
        flush()
        if p['xfer'] == 2 and p['extra'][:1] == b'\x00' and len(p['data']) >= 8:
            bm, req, val, idx, ln = struct.unpack('<BBHHH', p['data'][:8])
            name = DFU.get(req, f'0x{req:02x}') if bm & 0x60 else f'std {req}'
            print(f'{t:8.3f} dev{p["dev"]} SETUP bm=0x{bm:02x} {name} wValue=0x{val:04x} '
                  f'wIndex={idx} wLength={ln} {p["data"][8:].hex()}')
        elif p['xfer'] == 2 and p['back'] and p['data']:
            print(f'{t:8.3f}          <- {p["data"][:32].hex()}')
        elif p['xfer'] == 3 and p['data']:
            way = 'IN ' if p['back'] else 'OUT'
            print(f'{t:8.3f} dev{p["dev"]} BULK {way} ep 0x{p["ep"]:02x} {len(p["data"])} bytes')
    flush()
    print(f'\nbulk upload: {len(bulk)} bytes, crc32 {zlib.crc32(bulk):#010x}')
    if len(sys.argv) > 2:
        blob = open(sys.argv[2], 'rb').read()
        print(f'blob: {len(blob)} bytes, crc32 {zlib.crc32(blob):#010x}')
        print('upload starts with the blob:', bulk[:len(blob)] == blob)
        print('extra bytes after the blob:', bytes(bulk[len(blob):]).hex() or 'none')


if __name__ == '__main__':
    main()
