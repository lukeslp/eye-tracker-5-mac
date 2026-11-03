#!/usr/bin/env python3
"""Dump every stream of an MSI (OLE compound file) to a folder, standard
library only. Embedded cabinets come out as .cab files that bsdtar can
unpack."""
import os
import struct
import sys

FREESECT, ENDOFCHAIN = 0xFFFFFFFF, 0xFFFFFFFE


def msi_name(raw):
    """Decode MSI's packed stream names (base-64 in U+3800..U+4840)."""
    alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz._'
    out = []
    for ch in raw:
        c = ord(ch)
        if 0x3800 <= c < 0x4800:
            c -= 0x3800
            out.append(alphabet[c & 0x3F])
            out.append(alphabet[(c >> 6) & 0x3F])
        elif 0x4800 <= c < 0x4840:
            out.append(alphabet[c - 0x4800])
        elif c == 0x4840:
            out.append('!')
        else:
            out.append(ch)
    return ''.join(out)


def main(path, outdir):
    data = open(path, 'rb').read()
    if data[:8] != bytes.fromhex('d0cf11e0a1b11ae1'):
        sys.exit('not an OLE compound file')
    sec_shift, mini_shift = struct.unpack_from('<HH', data, 0x1E)
    ssz, mssz = 1 << sec_shift, 1 << mini_shift
    n_fat, dir_start, _, mini_cutoff, mini_fat_start, n_mini_fat, difat_start, n_difat = \
        struct.unpack_from('<IIIIIIII', data, 0x2C)
    sect = lambda i: data[(i + 1) * ssz:(i + 2) * ssz]

    difat = list(struct.unpack_from('<109I', data, 0x4C))
    s = difat_start
    for _ in range(n_difat):
        vals = struct.unpack('<%dI' % (ssz // 4), sect(s))
        difat += vals[:-1]
        s = vals[-1]
    fat = []
    for f in difat[:n_fat]:
        fat += struct.unpack('<%dI' % (ssz // 4), sect(f))

    def chain(start):
        out, s, seen = [], start, set()
        while s not in (ENDOFCHAIN, FREESECT) and s not in seen:
            seen.add(s)
            out.append(s)
            s = fat[s]
        return out

    read = lambda start: b''.join(sect(i) for i in chain(start))
    dirdata = read(dir_start)
    entries = []
    for off in range(0, len(dirdata), 128):
        e = dirdata[off:off + 128]
        nlen = struct.unpack_from('<H', e, 64)[0]
        name = e[:max(nlen - 2, 0)].decode('utf-16le', 'replace')
        etype = e[66]
        start, size = struct.unpack_from('<IQ', e, 116)
        entries.append((name, etype, start, size))

    root = entries[0]
    ministream = read(root[2])
    minifat = []
    if n_mini_fat:
        mf = read(mini_fat_start)
        minifat = list(struct.unpack('<%dI' % (len(mf) // 4), mf))

    def read_mini(start, size):
        out, s, seen = [], start, set()
        while s not in (ENDOFCHAIN, FREESECT) and s not in seen:
            seen.add(s)
            out.append(ministream[s * mssz:(s + 1) * mssz])
            s = minifat[s]
        return b''.join(out)[:size]

    os.makedirs(outdir, exist_ok=True)
    for name, etype, start, size in entries[1:]:
        if etype != 2:
            continue
        blob = read_mini(start, size) if size < mini_cutoff else read(start)[:size]
        clean = msi_name(name).replace('/', '_') or 'stream'
        if blob[:4] == b'MSCF' and not clean.endswith('.cab'):
            clean += '.cab'
        with open(os.path.join(outdir, clean), 'wb') as fh:
            fh.write(blob)
        print('%10d  %s' % (size, clean))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('usage: msi-streams.py <file.msi> <outdir>')
    main(sys.argv[1], sys.argv[2])
