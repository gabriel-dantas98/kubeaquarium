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

## Render

```bash
pnpm run still
pnpm run render
```

Outputs:

- `../docs/video/kubeaquarium-demo-poster.png`
- `../docs/video/kubeaquarium-demo.mp4`
