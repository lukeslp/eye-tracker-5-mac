# Activating the Eye Tracker 5, and why the Mac upload failed

October 18 to November 2, 2026.

## Summary

A new Tobii Eye Tracker 5 (ET5) ships in its **bootloader** (USB `2104:0102`, product "EyeChip"), and no driver can read gaze until Tobii's firmware has been uploaded once. With firmware running, it shows up as `2104:0313`.

Nine uploads from macOS failed on October 19. Each time the tracker took every chunk, then refused the final "manifest" step with DFU status 9 and dropped back to its bootloader, unharmed.

On November 2, Windows activated it with Tobii Experience 4.183.0.30025 while USBPcap recorded the exchange. The recording shows the difference: Windows sends the firmware followed by an **8-byte trailer** (`d2 68 23 eb 94 be 12 00`) and announces 1,228,444 bytes. My flasher sent the 1,228,436-byte image alone. DFU status 9 is `errNOTDONE`, "the device doesn't think it has all the data yet."

Activation happens once. After about five hours unplugged, the tracker came back directly as `2104:0313` with no new upload in Tobii's log. After that, macOS reads it without Tobii's software.

## The fix

`et5-flash.mjs` now has a `trailer` command that copies the 8 bytes stored right after the image in your own `platformservice`. It checks that the header just before the image matches and that the trailer's last four bytes equal the image length. The trailer it extracts is byte for byte what Windows sent. `flash <image> <header> <trailer>` then sends image + trailer, announces 1,228,444 bytes, and uses wIndex 0 for status requests, as Windows does.

## The device

| | Bootloader | Running firmware |
|---|---|---|
| USB ID | `2104:0102` | `2104:0313` |
| Product string | EyeChip | EyeChip (iSerial `IS5FF-…`) |
| Device class | 0 (per interface) | `EF/02/01` composite |
| Interfaces | 1: vendor (`FF`), bulk OUT `0x04`, bulk IN `0x82` | 3: vendor (`FF`) with bulk IN `0x83`, OUT `0x04`, OUT `0x05`; plus a video-class (`0E`) pair Windows exposes as "Tobii Hello Sensor" |
| Platform string | `/hw/platformtype=IS5LEYETRACKER5` | same, plus `/fw/fwversion=02a1a6a977` |

Both modes answer vendor request `0x30` (OUT 24 bytes, then IN 512 bytes) with a text block. The bootloader reports `/fw/upgradeprotocolversion=1`. The running firmware adds `/fw/t2serverversion=02a1a6a977` and `/fw/fwversion=02a1a6a977`, which matches the `t2srv:02a1a6a977` tag on the image extracted from the installer.

On the Mac the tracker worked through a monitor's built-in hub (USB4 link → Fresco Logic USB 2.0 hub → ASUS hub `0b05:0c23` → tracker at 480 Mb/s), through a powered USB 2.0 hub, and through a direct port. macOS loads only its generic composite driver for it and doesn't treat the video interfaces as a camera.

## Where the firmware comes from

- Installer: `Tobii.EyeTracker5.Offline.Installer_4.183.0.30025.msi` (142 MB, April 2023), from Tobii's getting-started page (files.update.tech.tobii.com). Its SHA-256 starts with `ac52312d`. Windows Update ships the same build for the ET5.
- The image is embedded in the `platformservice` binary inside the MSI's cabinet. tobiifree's `extract_firmware` finds two `caar` archives tagged `t2srv:02a1a6a977`.
- Inside `platformservice` the 1,228,436-byte image sits between a 24-byte DNLOAD header and an 8-byte trailer. tobiifree's extractor keeps the header and the image and **drops the trailer**.
- Header: magic `0x5a6b22f3`, 12 zero bytes, the image's CRC-32 (`0x4edf3347`), then its length (`0x0012be94` = 1,228,436). It matches the header Windows sent.
- Trailer: a 32-bit value `0xeb2368d2`, then the length again (`0x0012be94`). The first word isn't a common checksum of the image, so the flasher copies the trailer from your own copy of Tobii's file instead of computing it.

The firmware is Tobii's and signed. Uploading it to a tracker you own is fine; committing, publishing or shipping it is not. Every tool here reads it from your own copy of the installer.

## The Mac attempts (October 19)

`tools/et5-flash.mjs` started as a port of tobiifree's `assets/flash_firmware.c` to the Node `usb` package. It follows the DFU-style sequence tobiifree documents:

1. GETSTATUS; if in `dfuERROR`, CLRSTATUS + ABORT back to `dfuIDLE`.
2. DNLOAD (`0x41/0x01`, wValue 8) with the 24-byte header → `dfuDNLOAD-SYNC`.
3. DNLOAD with a 4-byte little-endian size.
4. Bulk OUT on endpoint `0x04` in 4,095-byte chunks.
5. GETSTATUS twice → `dfuDNLOAD-SYNC`, then `dfuDNLOAD-IDLE`.
6. Zero-length DNLOAD to trigger the manifest, then poll.
7. Vendor commit `0x10` wValue 4; the device re-enumerates as `0313`.

Every attempt reached step 6 and then read `state=10 (dfuERROR) status=9` on the first poll.

| Attempt | Image | Variants tried | USB path |
|---|---|---|---|
| 1 | 1,209,148-byte image (tobiifree's assumed layout) | none | monitor hub |
| 2–8 | 1,228,436-byte image | wIndex 0 vs 1 on status requests, a GETSTATUS before the bulk, delays before the bulk, with and without a USB reset, `clearHalt` on the bulk pipe | monitor hub, then a direct port |
| 9 | same | same | a USB hub on a second Mac |

Eight of the nine logs are in `logs/mac-attempts-2026-10-19/`; the ninth wasn't saved. The diagnostic probes are `tools/probe.mjs` and `tools/probe2.mjs`. The tracker returned to its bootloader every time, unharmed.

Ruled out at the time: a bad image (its checksum matches Tobii's header), old firmware (Windows Update ships the same build), the monitor's hub, and timing. Not tested: the upload length.

## The Windows activation (November 2)

- **PC:** a Beelink SER5 mini PC (Ryzen 5 5500U, 16 GB) on a clean install of Windows 11 Pro 26H2, build 26300.
- **Software:** Tobii Experience 4.183.0.30025 from the same offline MSI. The MSI sets `HKLM\SOFTWARE\Tobii\EyeX\DisableAutomaticFirmwareUpdate=True`, which governs later updates; the first activation still ran. USBPcap 1.5.4 and Wireshark 4.6.9 did the recording.
- **Capture scripts:** `tools/windows/start-capture.ps1` starts USBPcap on every root hub as SYSTEM scheduled tasks, so the recording survives an SSH session ending. `stop-capture.ps1` stops it, and `undo-usbpcap.ps1` removes USBPcap's filter driver.
- **Sequence:** I restarted the PC to clear pending updates, started the recorders, then plugged the tracker straight into the PC. It enumerated as `0102`, took the firmware and came back as `0313` within about 7 seconds. Windows then showed Eye Tracker 5, EyeChip and Tobii Hello Sensor, all working.
- **Capture:** 884 packets over 8.0 seconds on one root hub. It isn't published because it contains Tobii's firmware.

### What Windows sent, in order

Times are seconds from the first packet. Everything is on device address 2.

| t (s) | Request | Notes |
|---|---|---|
| 0.30 | Standard enumeration, SET_CONFIGURATION 1 | bootloader descriptors |
| 0.30 | Vendor `0x30` OUT (24 B: `01 00 00 00 00 00 00 00 01 00 00 00 04 00 …`), then `0x30` IN (512 B) | reads the `/fw/upgradeprotocolversion=1` block |
| 1.34 | GETSTATUS (wIndex 0) | `27 64 00 00 0a …`: status 0x27, `dfuERROR`, the same leftover error the Mac saw |
| 1.34 | CLRSTATUS, ABORT, GETSTATUS | back to `dfuIDLE` |
| 1.34 | DNLOAD wValue 8, 24-byte header | identical to the flasher's |
| 1.34 | GETSTATUS | `dfuDNLOAD-SYNC` |
| 1.34 | DNLOAD wValue 8, size **`9c be 12 00` = 1,228,444** | the flasher sent 1,228,436 |
| 1.34–1.40 | 300 bulk OUT transfers on `0x04`: 299 × 4,095 B and one 4,039 B, **1,228,444 B in all** | the image followed by the 8-byte trailer |
| 1.40 | GETSTATUS ×2 | `dfuDNLOAD-SYNC`, then `dfuDNLOAD-IDLE` |
| 1.40 | zero-length DNLOAD | manifest trigger |
| 1.91–5.40 | GETSTATUS every 0.5 s | `dfuDNBUSY` (state 4) with bytes 8–9 counting `00 03 06 0a 0e 11`, then `dfuMANIFEST` (state 7) with `90 12` |
| 5.40 | vendor `0x10` wValue 4 | commit; the device drops off the bus |
| 7.25 | re-enumeration as `2104:0313` | three interfaces, Windows Hello sensor descriptors |
| 7.41 | `0x30` query again, `0x46` (wValue 1, 8 B), `0x41` | firmware version block |
| 7.41–7.43 | bulk OUT `0x05` / IN `0x83` request-response pairs (`…0051…` → `…0052…`) | the runtime protocol tobiifree and tobii-linux speak |
| 7.78 onward | class requests to interface 1 (`wIndex 0x0401`) | the video-class "Hello" sensor setup |

### Windows compared with the original flasher

| Step | Windows | Original flasher | Matters? |
|---|---|---|---|
| Upload length announced | 1,228,444 | 1,228,436 | **Yes, most likely the cause** |
| Bulk payload | image + 8-byte trailer | image only | **Yes** |
| Status requests' wIndex | 0 | 1 by default, 0 tried | Probably not; the device answered both |
| Vendor `0x30` query before DFU | yes | no | Unknown; likely informational |
| Recovery from the leftover `dfuERROR` | CLRSTATUS + ABORT | same | No |
| Header | identical | identical | No |
| Chunking | 4,095 B on `0x04` | same | No |
| Passes | one | one, or a second if the first only "stores" | No |
| Manifest polling | every 0.5 s | every 0.7 s | No |
| Commit | `0x10` wValue 4 | same | No |
| USB reset and `clearHalt` before the upload | none seen (a reset wouldn't show in this capture) | yes by default | Probably not |

A manifest step that fails on the first poll with `errNOTDONE` is what a device does when it counted fewer bytes than the header promised. The bootloader seems to treat the trailer as part of the payload and to expect it before it verifies the image.

## macOS after activation

On November 2 the activated tracker enumerated as `2104:0313` on two Macs. A tobiifree-based helper (Node 24 and Node 26, which run tobiifree's TypeScript directly) reported ready and streamed about 33 samples a second: 377 in 12 seconds on one Mac, 260 in 8 seconds on the other. Every sample read "no eyes found": nobody was in front of it, it wasn't calibrated, and its display area was still tobiifree's 4 × 4 mm placeholder.

When testing a helper like this by hand, keep stdin open (for example `sleep 12 | node helper.mjs`) if it reads commands from stdin, or it exits as soon as it sees end of input.

On November 3 I plugged it straight into one Mac's USB 2 port, no hub, and it came up as `2104:0313` again with no activation step. A small WebSocket server on 127.0.0.1 that wraps the same helper passed 332 samples through in 10 seconds, all still empty for the same reasons. That wrapper has the opposite stdin habit: it keeps running after its input closes, so stop it yourself when a test is done.

## Still unknown

- Whether the trailer alone makes a Mac upload succeed.
- Whether the bootloader needs the `0x30` query before an upload.
- Whether an activated tracker can be safely returned to its bootloader to retest.
- What the counting bytes during `dfuDNBUSY` and the `90 12` during `dfuMANIFEST` mean. They look like progress.
- Whether the "Hello" video interface works on macOS. Gaze doesn't need it.

## Drivers and terms

The open drivers, their licenses and what each handles are in [driver-survey.md](driver-survey.md).

Tobii licenses the ET5 for **interactive use only**. Steering games and pointers with gaze is fine. Storing gaze data, for example to score another tracker against it, needs Tobii's analytical license. A live side-by-side comparison that stores nothing stays within the terms.
