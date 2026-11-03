# Eye Tracker 5 with and without an RGB camera

November 2, 2026. Notes for setting up gaze input on a desktop Mac.

## Short answer

The Eye Tracker 5 on its own tells you where you're looking on the screen, about 33 times a second, plus where each eye is in 3D, pupil size and whether each eye is present. It works in the dark because it lights your eyes with its own infrared. It only covers the screen it's mounted on, inside a seating box roughly 45 to 95 cm away, and Tobii publishes no accuracy figure for it.

An RGB camera sees what the tracker can't: the whole face (expressions, mouth, blinks as gestures), full head rotation, people outside the tracker's box, and gaze that isn't tied to one screen. As a gaze sensor it's clearly worse, usually 2 to 5 degrees of error against roughly 1 degree for good infrared trackers. It also wants decent, steady light.

So I'd use both. The ET5 points; the camera handles face and gestures, and fills in roughly when the ET5 loses you. Running both live also lets you check a webcam gaze model against the ET5 in real time. Storing ET5 gaze data needs Tobii's analytical license; a live comparison that stores nothing is fine.

## Suggested setup

1. Mount and calibrate the ET5 first; it's the pointer.
2. Add one external RGB camera (or an iPhone via Continuity Camera) centered above or just below the screen, for face, expressions, head pose and a coarse gaze fallback.
3. Light the face evenly from the front if the camera matters; the ET5 doesn't care.
4. If you want a webcam gaze model, compare it live against the ET5 without storing ET5 data.

## What the ET5 gives on its own

Source: Tobii's published specs, plus the fields the open driver tobiifree reads from the tracker on macOS.

| What | Detail |
|---|---|
| Gaze point on screen | Normalized 0 to 1 on the configured display area, per eye and combined |
| Rate | 33 samples per second output. Tobii says the image sensor runs at 133 Hz internally; I measured about 33 per second on two Macs |
| Eye position | Each eye's 3D position in mm, raw and calibrated, relative to the tracker and to the screen |
| Pupil diameter | Per eye, in mm |
| Presence | Per eye, present or absent; validity flags per sample |
| Head pose | Tobii's Windows software reports 6DoF head tracking (pitch ±45°, yaw ±65°, roll ±25°; X ±20 cm, Y ±15 cm, Z +30/−20 cm). tobiifree doesn't expose a head-pose stream; head position can be estimated from the two eye positions, but not full rotation |
| Distance | About 45 to 95 cm (Tobii, via Tom's Hardware); one retailer lists 50 to 95 cm |
| Screen size | Rated up to 27 inches at 16:9 or 30 inches at 21:9. on a 31.5-inch monitor, expect weaker corners |
| Light | Its own near-infrared illuminators, so darkness is fine. Direct sunlight and strong IR sources (sun through a window, halogen lamps) add false reflections and hurt tracking. Glasses usually work; reflective coatings can cause glare |
| Accuracy | Tobii publishes no ET5 figure. The independent studies I found report in pixels, not degrees. Good infrared remote trackers sit around 1 degree; treat that as the ballpark, not a measured ET5 number |
| Camera image | The tracker also has a "Windows Hello" infrared camera. macOS lists its video interfaces but doesn't treat it as a camera, so those images can't be used today |

What it can't give: anything off the screen it's mounted on, faces or expressions, more than one person, or anything outside its seating box.

## What an RGB camera adds

| What | Notes |
|---|---|
| Face and expressions | Face mesh landmarks (MediaPipe and similar): mouth, brows, cheeks, blinks and winks as deliberate signals. Useful as switches for access. The ET5 gives eye presence but not expressions |
| Full head rotation | 6DoF head pose from the face mesh. tobiifree doesn't expose this from the ET5 |
| Coverage | Wider field of view, people outside the ET5's box, more than one person, gaze toward things that aren't the screen |
| Gaze, roughly | Webcam gaze methods usually land between 2 and 5 degrees: WebGazer about 3 to 4°, appearance models on the hard ETH-XGaze benchmark about 3.1 to 4.7°. One MediaPipe paper claims 1.1 to 1.3° with a five-point calibration, self-reported. Vendor studies report about 2.3 to 3 cm of error at 60 to 75 cm |
| Data you can keep | The camera is yours, so recording it raises no Tobii license issue (privacy still applies) |

How much error that is on a 31.5-inch 6K screen: at 60 cm, 1 degree is about 1 cm, or about 90 px on a 6K panel that size. So the ET5 picks out a button; a webcam picks out a region of the screen roughly 4 cm across.

## Laptop camera vs external

- **Built-in laptop camera:** usually 720p or 1080p, fixed above the screen. Fixed geometry is an advantage. In Noldus's validation (17 people, about 75 cm, natural light), the laptop beat a desktop setup slightly, 2.3 cm against 2.5 cm mean error, which they put down to the camera's fixed alignment. Downsides: looking down at the bottom of the screen partly hides the eyes under the lids, and small sensors struggle in dim light.
- **External camera:** better optics and low-light performance, 1080p or 4K, and you can place it. RealEye's guidance: sit directly in front of it, camera slightly below eye level, face well and evenly lit, lighting unchanged during use. An iPhone via Continuity Camera is a strong option on a Mac.
- Resolution matters mostly for distance. Rough estimate for a 1080p camera with a 70° field of view: an iris is about 27 px across at 60 cm and about 16 px at 1 m. Fewer pixels on the iris means less precise gaze.

## Multiple angles

- Arar et al. (2017) used three cameras with a fusion step that weights each view by head pose. They reported about 1 degree at 30 fps and nearly 100% availability in hard cases, mainly because some view still sees the eye when the head turns or glasses glare.
- Costs: synchronizing the cameras, calibrating their geometry, and more compute. One group's prototype; I found no independent replication.
- I'd start with the ET5 plus one RGB camera, which is already two views of different kinds. Add a second RGB angle only if head turns or occlusion turn out to matter in practice, for example someone using a head-mounted switch or lying at an angle.

## Distance and light at a glance

| | ET5 | RGB webcam |
|---|---|---|
| Distance | 45 to 95 cm, best around 60 | Works at any distance the face fills enough pixels; studies typically use 60 to 75 cm |
| Dark room | Works (own infrared) | Fails or degrades badly; an infrared webcam (Windows Hello type) would work |
| Normal indoor light | Works | Works if the face is evenly lit and the light is steady |
| Bright window behind you | Fine for the ET5 unless sun hits your eyes | Bad: face goes dark against the background |
| Direct sun on the face | Degrades: false reflections | Usable, but harsh shadows hurt |
| Glasses | Usually fine; glare can drop samples | Usually fine; reflections can hide the eyes |

## Sources

- Tobii, [Specifications for Eye Tracker 5](https://help.tobii.com/hc/en-us/articles/360012483818-Specifications-for-Eye-Tracker-5) (6DoF head tracking ranges, 33 Hz) and a Tobii developer-forum reply on the 133 Hz internal rate
- Tom's Hardware, [Tobii Eye Tracker 5 Adds Eye Tracking to Your Gaming PC](https://www.tomshardware.com/uk/news/tobii-eye-tracker-5-pc-games) (45 to 95 cm)
- Galaxus listing, [Tobii Eye Tracker 5](https://www.galaxus.nl/en/s1/product/tobii-eye-tracker-5-pc-gaming-controller-13452943) (screen size, 50 to 95 cm)
- Housholder et al., "Evaluating Accuracy of the Tobii Eye Tracker 5", ICHI 2021 ([dblp](https://dblp.org/rec/conf/ihci/HousholderRPVM21)); Hansen et al., AHFE 2024 ([paper](https://openaccess.cms-conferences.org/publications/book/978-1-958651-95-7/article/978-1-958651-95-7_74)). Neither gave a degree figure in what I could read
- Zhang et al., [ETH-XGaze](https://arxiv.org/pdf/2007.15837); [ETH-XGaze leaderboard](https://hyper.ai/en/sota/tasks/gaze-estimation/benchmark/gaze-estimation-on-eth-xgaze)
- [Webcam-based gaze estimation for computer screen interaction](https://www.frontiersin.org/articles/10.3389/frobt.2024.1369566), Frontiers in Robotics and AI 2024; [webcam tools review](https://link.springer.com/10.3758/s13428-023-02190-6), Behavior Research Methods 2023; [MediaPipe calibration paper](https://doaj.org/article/21ad3ac72299486a9497a31f1eb60713), IEEE Access 2024
- Noldus, [FaceReader webcam eye tracking white paper](https://noldus.com/shared/resources/book/noldus-white-papers-resources/chapter/facereader/page/facereader-webcam-based-eye-tracking)
- RealEye, [accuracy](https://support.realeye.io/realeye-accuracy) and [how to get accurate results](https://support.realeye.io/how-to-get-accurate-results/)
- Arar et al., [Robust Real-Time Multi-View Eye Tracking](https://arxiv.org/abs/1711.05444)
- Smartbox, [Lumin-i tips for outdoor use](https://hub.thinksmartbox.com/app/uploads/2022/08/Lumin-i-Tips-for-outdoor-use-UK-A.pdf); [Microsoft patent on IR eye tracking in high ambient light](https://patent.nweon.com/7834)
- iMotions, [Webcam eye tracking vs an eye tracker](https://imotions.com/blog/webcam-eye-tracking-vs-an-eye-tracker/)
- Field list: tobiifree `sdk/src/protocol.ts`
