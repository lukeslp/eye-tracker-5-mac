# Open drivers for the Eye Tracker 5: a survey

October 19, 2026, updated November 2.

I surveyed open drivers and wrappers for the Tobii Eye Tracker 5 before trying to use one on a Mac. Each repository was checked through the GitHub API on October 19, 2026; "last push" is as of that date.

## The short version

I use **tobiifree**. It runs over WebUSB and Node, and it's the only project with a firmware path (extract and flash).

None of them help until the tracker has firmware, though. A new ET5 enumerates as `2104:0102` (bootloader), and tobiifree accepts only `0x0313`, `0x031e` and `0x0127` (`sdk/src/webusb.ts`). Tobii's Windows software uploads the firmware on the first plug-in, and after that the tracker comes up as `0313` on other systems too ([tobiifree issue #8](https://github.com/Aetherall/tobiifree/issues/8)). Mine stayed activated after hours unplugged; see [activation.md](activation.md).

If I write my own driver, I'd start from **Gaze for Mac** plus **njmill/tobii-linux** (both Apache-2.0, tested on Apple Silicon), with **Skyggedans/tobii-linux** (MIT) open in another tab for its protocol notes.

## Activation routes

- **Conventional:** plug the tracker into any x64 Windows PC once, let Tobii Experience install, and move it back to the Mac. This is the supported route, and it's what worked for me.
- **From the Mac:** flash it with firmware taken from Tobii's own Windows installer. tobiifree's flasher and my port both failed at the manifest step. A USB capture of Windows then showed the missing 8-byte trailer, and the flasher in this repository now sends it.

## A tip for any of them

Only one program can claim the tracker at a time. If `claimInterface` fails, quit anything else that may hold it, including browsers with a WebUSB page open (tobiifree issue #8 shows the same failure).

## Drivers and wrappers

| Project | License | Last push | Platform | Bootloader handling |
|---|---|---|---|---|
| [Aetherall/tobiifree](https://github.com/Aetherall/tobiifree) | GPL-3.0 | 2026-10-12 | Zig to wasm, TypeScript SDK, WebUSB and Node; Linux daemon | Yes: `assets/extract_firmware.c` plus `flash_firmware.c` (libusb, DFU) |
| [Skyggedans/tobii-linux](https://github.com/Skyggedans/tobii-linux) | MIT | 2026-10-18 | Rust daemon plus drop-in Stream Engine 4.1 `libtobii.so`; Linux, systemd | None; assumes `0313` |
| [taco-devs/gaze-for-mac](https://github.com/taco-devs/gaze-for-mac) | Apache-2.0 | 2026-09-07 | Native macOS app with a C libusb helper, Swift UI, calibration, overlay and pointer; tested on Apple Silicon | Tested only on trackers already set up on Windows |
| [njmill/tobii-linux](https://github.com/njmill/tobii-linux) | Apache-2.0 | 2026-07-11 | The transport and decoder Gaze for Mac is built on | Not covered |
| [Tropaion/Tobii_Linux](https://github.com/Tropaion/Tobii_Linux) | GPL-3.0 | 2026-09-29 | Clean-room Rust driver for Linux | Leaves flashing out on purpose; avoids tobiifree's flasher for provenance reasons |
| [kingo132/TobiiBridge](https://github.com/kingo132/TobiiBridge) | GPL-3.0 | 2026-10-11 | Native macOS menu-bar app (Swift, Zig, libusb) | None; built for the laptop IS5 `2104:030E` |
| [puffnfresh/nottobii](https://github.com/puffnfresh/nottobii) | GPL-3.0 | 2026-03-18 | Rust and libusb; Wayland tools | None; also needs calibration files made on Windows |
| [yukun08042/Tobii-mac](https://github.com/yukun08042/Tobii-mac) | none stated | 2026-06-29 | Talon on macOS, serving gaze over HTTP | Says the tracker must be activated once on Windows |
| [calledtoconstruct/tobii-eye](https://github.com/calledtoconstruct/tobii-eye) | none stated | 2026-10-06 | Rust, Arch package | None |
| [ChrisVeigl/tobiifree](https://github.com/ChrisVeigl/tobiifree) (fork) | GPL-3.0 | 2026-10-10 | Adds a Python gaze mouse | Same as upstream |
| [GazePlay/TobiiStreamEngineForJava](https://github.com/GazePlay/TobiiStreamEngineForJava) | GPL-3.0 | 2024-02 | JNI over Tobii's Stream Engine; macOS "work in progress" | Needs Tobii's runtime |
| [labstreaminglayer/App-TobiiStreamEngine](https://github.com/labstreaminglayer/App-TobiiStreamEngine) | unclear | 2023-12 | Stream Engine to LSL | Needs Tobii's runtime |
| [basophobic/enhanced-tobii-eyetracker](https://github.com/basophobic/enhanced-tobii-eyetracker) | none stated | 2025-09 | Windows research app | Needs Tobii's runtime |
| [BenjaminZehowlt/VPETobii](https://github.com/BenjaminZehowlt/VPETobii) | MIT | 2024-02 | EyeChip in the Vive Pro Eye | n/a |
| [opendot/amelie-Tobii-driver](https://github.com/opendot/amelie-Tobii-driver) | GPL-3.0 | 2020-02 | 4C only | n/a |
| [BenLeech/tobii-eye-mouse-control](https://github.com/BenLeech/tobii-eye-mouse-control) | none stated | 2018-02 | C#, EyeX/4C | n/a |
| Talon | proprietary, free | n/a | macOS universal | The [Talon wiki](https://talon.wiki/Resource%20Hub/Hardware/tobii_5/) says first setup needs Windows |

## Worth learning from

- **TobiiBridge** shows a Tobii IS5 device driven from macOS through libusb with no kernel extension, using tobiifree's Zig core. Its test machine was an Intel Mac.
- **Skyggedans/tobii-linux** reproduces Stream Engine gaze bit for bit and exposes head pose, presence and the IR image.
- **tobiifree issue #8:** once flashed, the tracker keeps its firmware. The A/B slots in `flash_firmware.c` also point to persistent storage.

## Ruled out

- **Skyggedans/tobii-linux, nottobii, calledtoconstruct:** none can leave the bootloader, and all are tied to Linux (systemd, uinput, Wayland). Useful as reference.
- **Stream Engine wrappers** (GazePlay, LSL, basophobic): they need Tobii's Windows runtime, which has no macOS build.
- **amelie, BenLeech:** they target the 4C or EyeX and are unmaintained.
- **Tobii Pro SDK** (`tobii_research`): Pro trackers only.
- **A Windows-on-ARM virtual machine on an Apple Silicon Mac:** Tobii's drivers are x64.
