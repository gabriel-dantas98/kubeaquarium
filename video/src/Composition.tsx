import { Video } from "@remotion/media";
import type { CSSProperties } from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const footage = "kubeaquarium-footage.webm";
export type Beat = { name: string; at: number };

export const KubeAquariumDemo = ({ beats = [] }: { beats?: Beat[] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const active = [...beats].reverse().find((beat) => frame / fps >= beat.at);
  const caption = active ? captions[active.name] : "Simulated Kubernetes lifecycle";
  return <AbsoluteFill style={styles.root}>
    <AbsoluteFill style={styles.videoFrame}><Video muted objectFit="cover" src={staticFile(footage)} style={styles.video} /></AbsoluteFill>
    <AbsoluteFill style={styles.vignette} />
    {!active && <div style={styles.title}><span style={styles.brand}>kubeaquarium</span><span style={styles.subtitle}>Simulated Kubernetes lifecycle</span></div>}
    <div style={{ ...styles.caption, opacity: captionOpacity(frame, active, fps) }}>{caption}</div>
  </AbsoluteFill>;
};

const captions: Record<string, string> = { inspect: "Inspect the unhealthy pod", request: "Request accepted", absent: "Pod absent", candidate: "New replica observed", ready: "Ready observed", closing: "Return to the aquarium" };
function captionOpacity(frame: number, active: Beat | undefined, fps: number) {
  if (!active) return 0;
  const start = active.at * fps;
  return interpolate(frame, [start, start + fps * 0.35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
}
const styles: Record<string, CSSProperties> = {
  root: { background: "#03101d", color: "#e8f6ff" }, videoFrame: { overflow: "hidden" }, video: { width: "100%", height: "100%" },
  vignette: { background: "linear-gradient(180deg, rgba(2,8,16,.64) 0%, rgba(2,8,16,.04) 32%, rgba(2,8,16,.12) 64%, rgba(2,8,16,.76) 100%)" },
  title: { position: "absolute", right: 32, bottom: 100, textAlign: "right", display: "flex", flexDirection: "column", gap: 4, textShadow: "0 2px 22px rgba(0,0,0,.7)" }, brand: { fontSize: 28, fontWeight: 800, lineHeight: 1 }, subtitle: { color: "#cfe9ff", fontSize: 14, fontWeight: 650 },
  caption: { position: "absolute", left: 42, bottom: 32, padding: "10px 15px", borderRadius: 8, background: "rgba(2, 14, 25, .78)", color: "#e8f6ff", fontSize: 24, fontWeight: 750, textShadow: "0 2px 12px rgba(0,0,0,.7)" },
};
