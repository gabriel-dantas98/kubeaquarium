import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const beats = JSON.parse(await readFile(path.join(root, 'video/public/kubeaquarium-beats.json'), 'utf8'));
const { introSeconds } = JSON.parse(await readFile(path.join(root, 'video/timing.json'), 'utf8'));
const offset = introSeconds - beats[0].at;
const time = name => {
  const beat = beats.find(item => item.name === name);
  if (!beat) throw new Error('Missing video chapter: ' + name);
  return beat.at + offset;
};
const clips = [[0.7, 2.2], [time('overview') + 0.5, 2.4], [time('fleet') + 0.2, 3.4], [time('dive') + 0.3, 2], [time('ready') + 0.5, 2.8]];
const split = '[0:v]split=5' + clips.map((_, i) => '[s' + i + ']').join('') + ';';
const trims = clips.map(([start, duration], i) => '[s' + i + ']trim=start=' + start + ':duration=' + duration + ',setpts=PTS-STARTPTS[c' + i + ']').join(';') + ';';
const concat = clips.map((_, i) => '[c' + i + ']').join('') + 'concat=n=5:v=1:a=0,fps=8,scale=720:-1:flags=lanczos,split[p][v];[p]palettegen=max_colors=128:stats_mode=diff[pal];[v][pal]paletteuse=dither=bayer:bayer_scale=3';
const result = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'warning', '-i', path.join(root, 'docs/video/kubeaquarium-demo.mp4'), '-filter_complex', split + trims + concat, '-loop', '0', path.join(root, 'docs/video/kubeaquarium-demo-preview.gif')], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
