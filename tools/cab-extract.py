#!/usr/bin/env python3
"""Extract an MSZIP-compressed Microsoft cabinet with the standard library.
Usage: cab-extract.py <file.cab> <outdir> [name-substring]"""
import os
import struct
import sys
import zlib


def main(path, outdir, match=None):
    d = open(path, 'rb').read()
    sig, _, size, _, coff_files, _, vmin, vmaj, n_folders, n_files, flags, set_id, icab = \
        struct.unpack_from('<4sIIIIIBBHHHHH', d, 0)
    assert sig == b'MSCF'
    off = 36
    cb_folder = cb_data = 0
    if flags & 4:
        cb_header, cb_folder, cb_data = struct.unpack_from('<HBB', d, off)
        off += 4 + cb_header
    folders = []
    for _ in range(n_folders):
        start, n_data, ctype = struct.unpack_from('<IHH', d, off)
        folders.append((start, n_data, ctype))
        off += 8 + cb_folder
    files = []
    off = coff_files
    for _ in range(n_files):
        usize, uoff, ifolder, date, time, attribs = struct.unpack_from('<IIHHHH', d, off)
        end = d.index(b'\0', off + 16)
        name = d[off + 16:end].decode('utf-8' if attribs & 0x80 else 'latin-1')
        files.append((name, usize, uoff, ifolder))
        off = end + 1

    cache = {}

    def folder_data(i):
        if i in cache:
            return cache[i]
        start, n_data, ctype = folders[i]
        if ctype & 0xF != 1:
            sys.exit('folder %d is not MSZIP (type 0x%x)' % (i, ctype))
        out, pos, zdict = bytearray(), start, b''
        for _ in range(n_data):
            _, cb, ucb = struct.unpack_from('<IHH', d, pos)
            pos += 8 + cb_data
            block = d[pos:pos + cb]
            pos += cb
            assert block[:2] == b'CK'
            dec = zlib.decompressobj(-15, zdict=zdict) if zdict else zlib.decompressobj(-15)
            chunk = dec.decompress(block[2:]) + dec.flush()
            out += chunk
            zdict = chunk[-32768:]
        cache.clear()
        cache[i] = bytes(out)
        return cache[i]

    os.makedirs(outdir, exist_ok=True)
    for name, usize, uoff, ifolder in sorted(files, key=lambda f: (f[3], f[2])):
        if match and match.lower() not in name.lower():
            continue
        blob = folder_data(ifolder)[uoff:uoff + usize]
        dest = os.path.realpath(os.path.join(outdir, name.replace('\\', '/').replace('..', '_').lstrip('/')))
        root = os.path.realpath(outdir)
        if os.path.commonpath([dest, root]) != root:
            raise SystemExit(f'refusing to write outside {outdir}: {name}')
        os.makedirs(os.path.dirname(dest) or outdir, exist_ok=True)
        with open(dest, 'wb') as fh:
            fh.write(blob)
        print('%10d  %s' % (usize, name))


if __name__ == '__main__':
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    main(*sys.argv[1:])
