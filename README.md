# Eye Tracker 5 on macOS

Notes and tools for getting a Tobii Eye Tracker 5 working on a Mac.

The Eye Tracker 5 is a Windows peripheral, and it's designed like one. A new unit ships with just a bootloader, and Tobii's Windows software loads the working firmware the first time you plug it in. The tracker keeps it from then on, which is why every open-source driver tells you to visit a Windows PC once before using the tracker anywhere else.

This repo covers the Mac side: doing that first step without Windows, and using an activated tracker on macOS without Tobii's software. It's interoperability work on my own hardware, built from Tobii's public installer, USB captures of my own tracker and the open-source projects credited below.

## Status

| | |
|---|---|
| Activation on Windows | Works (Tobii Experience 4.183.0.30025) |
| Activation from macOS | The flasher now sends the upload the way Windows does. It needs a tracker still in its bootloader to try it on |
| Gaze on macOS after activation | Streams through tobiifree; calibration in progress |

Got a never-activated Eye Tracker 5 and a Mac? Run the flasher and open an issue with the output, whichever way it goes.

## What I found

The Mac uploads were 8 bytes short. Windows sends the firmware image plus an 8-byte trailer and announces the longer length. Without it, the bootloader rejected every Mac upload at the last step with `errNOTDONE`, which is what a short upload looks like. The trailer sits right after the image inside Tobii's own service binary, and tobiifree's extractor drops it.

Activation happens once. The firmware survives power loss: after hours unplugged, the tracker came back ready with no new upload.

After that, macOS doesn't need Tobii's software at all. Through [tobiifree](https://github.com/Aetherall/tobiifree) under Node, the tracker streams about 33 gaze samples a second.

The packet-by-packet comparison is in [docs/activation.md](docs/activation.md).

## What's here

| Path | What it is |
|---|---|
| [docs/activation.md](docs/activation.md) | The fix, the device, where the firmware lives, the Mac attempts, the Windows capture |
| [docs/driver-survey.md](docs/driver-survey.md) | Open Eye Tracker 5 drivers and wrappers, with licenses |
| [docs/gaze-sensing-options.md](docs/gaze-sensing-options.md) | What the Eye Tracker 5 gives alone vs with an RGB camera; distance and lighting |
| [tools/et5-flash.mjs](tools/et5-flash.mjs) | Firmware uploader for macOS (Node `usb`, no libusb install) |
| [tools/msi-streams.py](tools/msi-streams.py), [tools/cab-extract.py](tools/cab-extract.py) | Unpack Tobii's MSI and its cabinets with the Python standard library |
| [tools/pcap-decode.py](tools/pcap-decode.py) | Turn a USBPcap capture of an activation into a timeline and compare the upload with an image |
| [tools/probe.mjs](tools/probe.mjs), [tools/probe2.mjs](tools/probe2.mjs) | Bootloader diagnostics from the debugging |
| [tools/windows/](tools/windows/) | PowerShell scripts to record an activation with USBPcap on Windows |
| [logs/mac-attempts-2026-10-19/](logs/mac-attempts-2026-10-19/) | Output of eight of the nine failed Mac uploads |

## Using the flasher

You need Node 20.15 or newer (for `zlib.crc32`), a tracker in its bootloader (`2104:0102`), and your own copy of Tobii's offline installer, `Tobii.EyeTracker5.Offline.Installer_4.183.0.30025.msi`, from Tobii's getting-started page. The firmware is Tobii's, so keep it out of any repository.

1. Install the USB package:

   ```bash
   npm install
   ```

2. Unpack the installer and find `platformservice`:

   ```bash
   python3 -I tools/msi-streams.py Tobii.EyeTracker5.Offline.Installer_4.183.0.30025.msi streams/
   python3 -I tools/cab-extract.py streams/drivers.cab cab/ platformservice
   ```

3. Extract the firmware image and its header with tobiifree's `assets/extract_firmware.c` (any C compiler will build it). For this installer the image is 1,228,436 bytes.

4. Copy the trailer and check the image against its header:

   ```bash
   node tools/et5-flash.mjs trailer cab/platformservice fw/et5-blob.bin fw/et5-trailer.bin
   node tools/et5-flash.mjs check fw/et5-blob.bin fw/et5-header.bin
   ```

   For this installer the trailer is `d2 68 23 eb 94 be 12 00`.

5. Check the bootloader, then flash:

   ```bash
   node tools/et5-flash.mjs status
   node tools/et5-flash.mjs flash fw/et5-blob.bin fw/et5-header.bin fw/et5-trailer.bin
   ```

If it works, the tracker drops off the bus and comes back as `2104:0313`. Every failed attempt so far left the tracker sitting in its bootloader, unharmed. That's not a promise. Flash at your own risk.

## Reading gaze

Once the tracker shows up as `2104:0313`, any driver in the survey can read it. I use tobiifree's TypeScript SDK under Node, which runs on macOS with the `usb` package and no kernel extension. Set the display area to your screen's size in millimeters and calibrate before you trust the coordinates.

## Licenses and terms

- The code is GPL-3.0 ([LICENSE](LICENSE)) because `tools/et5-flash.mjs` and the probes port tobiifree's GPL-3.0 `flash_firmware.c`. The Python tools are mine and could be relicensed on request.
- Tobii's firmware and installer aren't included and mustn't be redistributed. The `.gitignore` keeps images, installers and captures out of git.
- Tobii licenses the Eye Tracker 5 for interactive use. Storing gaze data needs Tobii's analytical license.
- Everything here comes from public material: Tobii's downloadable installer, USB captures of my own tracker, and the open-source projects credited below. It doesn't use Tobii's source code, internal documentation or other non-public information.
- Tobii, Eye Tracker 5 and Tobii Experience belong to Tobii AB. This project isn't affiliated with or endorsed by Tobii.

## Credits

[Aetherall/tobiifree](https://github.com/Aetherall/tobiifree) for the firmware extractor, the original flasher and the SDK all this leans on. [Skyggedans/tobii-linux](https://github.com/Skyggedans/tobii-linux) for the protocol documentation. [USBPcap](https://desowin.org/usbpcap/) and Wireshark for the capture.
