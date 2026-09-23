import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const videoRoot = path.resolve(import.meta.dirname, '..');
const beats = JSON.parse(await readFile(path.join(videoRoot, 'public/kubeaquarium-beats.json'), 'utf8'));
const { introSeconds, fps } = JSON.parse(await readFile(path.join(videoRoot, 'timing.json'), 'utf8'));
const ready = beats.find(beat => beat.name === 'ready');
const closing = beats.find(beat => beat.name === 'closing');
if (!Number.isFinite(beats[0]?.at) || !Number.isFinite(ready?.at) || !Number.isFinite(closing?.at)) {
  throw new Error('Poster requires valid first, Ready and closing capture beats');
}
const posterTime = ready.at + 1;
if (posterTime >= closing.at) throw new Error('Ready chapter must remain visible for at least one second');
const frame = Math.round((introSeconds + posterTime - beats[0].at) * fps);
console.log(`Rendering observed Ready poster at frame ${frame}`);
const result = spawnSync('pnpm', ['exec', 'remotion', 'still', 'src/index.ts', 'KubeAquariumDemo', '../docs/video/kubeaquarium-demo-poster.png', '--frame', String(frame)], { cwd: videoRoot, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
