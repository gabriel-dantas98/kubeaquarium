import { Video } from "@remotion/media";
import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const footage = "kubeaquarium-footage.webm";

export const KubeAquariumDemo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleOpacity = fade(frame, 0, 1.2 * fps);
  const titleY = interpolate(frame, [0, 1.2 * fps], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const footerOpacity = fade(frame, 9 * fps, 1.2 * fps);

  return (
    <AbsoluteFill style={styles.root}>
      <AbsoluteFill style={styles.videoFrame}>
        <Video muted objectFit="cover" src={staticFile(footage)} style={styles.video} />
      </AbsoluteFill>

      <AbsoluteFill style={styles.vignette} />

      <Sequence durationInFrames={6 * fps}>
        <div
          style={{
            ...styles.title,
            opacity: titleOpacity,
            transform: `translateY(${titleY}px)`,
          }}
        >
          <span style={styles.brand}>kubeaquarium</span>
          <span style={styles.titleCopy}>
            Live Kubernetes pods rendered as an explorable aquarium.
          </span>
        </div>
      </Sequence>

      <Sequence from={8 * fps}>
        <div style={{ ...styles.footer, opacity: footerOpacity }}>
          <span>Server-side namespace filters</span>
          <span style={styles.dot} />
          <span>Instanced Three.js rendering</span>
          <span style={styles.dot} />
          <span>High-scale adaptive simulation</span>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};

function fade(frame: number, from: number, duration: number) {
  return interpolate(frame, [from, from + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
}

const styles: Record<string, CSSProperties> = {
  root: {
    background: "#03101d",
    color: "#e8f6ff",
  },
  videoFrame: {
    overflow: "hidden",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  vignette: {
    background:
      "linear-gradient(180deg, rgba(2,8,16,0.62) 0%, rgba(2,8,16,0.08) 32%, rgba(2,8,16,0.18) 64%, rgba(2,8,16,0.72) 100%)",
  },
  title: {
    position: "absolute",
    left: 48,
    top: 38,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    textShadow: "0 2px 22px rgba(0,0,0,0.7)",
  },
  brand: {
    fontSize: 46,
    fontWeight: 800,
    letterSpacing: 0,
    lineHeight: 1,
  },
  titleCopy: {
    maxWidth: 560,
    fontSize: 22,
    fontWeight: 500,
    lineHeight: 1.25,
    color: "#cfe9ff",
  },
  footer: {
    position: "absolute",
    left: 48,
    right: 48,
    bottom: 34,
    display: "flex",
    alignItems: "center",
    gap: 14,
    color: "#d8f1ff",
    fontSize: 18,
    fontWeight: 650,
    textShadow: "0 2px 18px rgba(0,0,0,0.75)",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    background: "#7dd3fc",
    boxShadow: "0 0 18px rgba(125,211,252,0.95)",
  },
};
