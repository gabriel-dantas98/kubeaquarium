import { rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
const input = path.join(root, "docs", "video", "kubeaquarium-demo.mp4");
const output = path.join(root, "docs", "video", "kubeaquarium-demo.optimized.mp4");

const result = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    input,
    "-an",
    "-vf",
    "fps=30",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "25",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

await rename(output, input);
