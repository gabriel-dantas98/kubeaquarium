# kubeaquarium demo video

The video records only the repeatable simulated recovery mission. It never connects to a Kubernetes API: the capture and verifier reject any `/api/` request or non-read network method, and refuse URLs that are not local `?demo` URLs.

Use two terminals. Start the demo app in the first:

```bash
cd web
npm run dev -- --host 127.0.0.1 --port 7781
```

Then validate and capture in the second:

```bash
cd video
DEMO_URL='http://127.0.0.1:7781/?demo' node scripts/verify-recovery.mjs
DEMO_URL='http://127.0.0.1:7781/?demo' pnpm capture
pnpm lint
pnpm render
pnpm still
```

Capture writes `public/kubeaquarium-footage.webm` and `public/kubeaquarium-beats.json`. The Remotion composition reads the captured beats and ends two seconds after the final one at 24 FPS. Rendering creates `../docs/video/kubeaquarium-demo.mp4`; the still creates `../docs/video/kubeaquarium-demo-poster.png`.

Review both outputs at 960×540 before publishing: the simulated marker, the Ready conclusion, and all captions must remain legible.
