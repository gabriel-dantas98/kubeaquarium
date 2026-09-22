# kubeaquarium demo video

The video records only the repeatable simulated recovery mission. It never connects to a Kubernetes API: the capture and verifier reject any `/api/` request or non-read network method, and refuse URLs that are not local `?demo` URLs.

Use two terminals. Start the demo app in the first:

```bash
cd web
npm run dev -- --host 127.0.0.1 --port 7781
```

Then validate and capture in the second (keep enough free disk space for temporary render frames):

```bash
cd video
DEMO_URL='http://127.0.0.1:7781/?demo' node scripts/verify-recovery.mjs
DEMO_URL='http://127.0.0.1:7781/?demo' pnpm capture
pnpm lint
pnpm render
pnpm still
pnpm preview
```

Capture writes `public/kubeaquarium-footage.webm` and `public/kubeaquarium-beats.json`. The Remotion composition reads the captured beats and uses a 2.5-second opening, trims the loading frames, and ends three seconds after the final beat at 30 FPS. Rendering creates `../docs/video/kubeaquarium-demo.mp4`; the still creates `../docs/video/kubeaquarium-demo-poster.png`.

The final video is 1440×940, framing the 1280×720 recording with a header and a separate caption/chapter strip. The opening, namespace filter, radar, pod inspection, submarine and observed recovery are driven by actual captured beats. Review the poster and frames from radar, inspection and Ready before publishing.

`pnpm preview` creates `../docs/video/kubeaquarium-demo-preview.gif`, a 720-pixel-wide, 8 FPS montage for the README. It links to the full MP4. The video is intentionally silent so the demo is understandable without audio. FFmpeg is required for MP4 optimization and the preview.

## Visual benchmark

The benchmark uses a separate, clean checkout for the baseline. Set `BENCH_BASELINE_ROOT` to that checkout's `web` directory; the runner records its repository and revision in `metrics.json` and refuses tracked changes.

```bash
BENCH_TARGET=baseline BENCH_BASELINE_ROOT='/absolute/path/to/baseline/web' node scripts/benchmark-visual.mjs
BENCH_TARGET=final node scripts/benchmark-visual.mjs
```
