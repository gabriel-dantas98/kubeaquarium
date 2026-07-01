# kubeaquarium demo video

Remotion project for the README demo video.

## Capture footage

Start kubeaquarium first:

```bash
go run ./cmd/kubeaquarium --addr 127.0.0.1:7781 --no-open --namespace monitoring
```

Then capture browser footage:

```bash
cd video
pnpm install
DEMO_URL=http://127.0.0.1:7781 pnpm run capture
```

The capture script writes `public/kubeaquarium-footage.webm`.
It records at 960x540 so the source footage stays small enough for the repo.

## Render

```bash
pnpm run still
pnpm run render
```

Outputs:

- `../docs/video/kubeaquarium-demo-poster.png`
- `../docs/video/kubeaquarium-demo.mp4`

`pnpm run render` runs Remotion first, then recompresses the MP4 with FFmpeg (`crf=34`, no audio, 960x540, 24 FPS) to keep the checked-in README demo small.
