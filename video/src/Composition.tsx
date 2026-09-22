import { Video } from "@remotion/media";
import type { CSSProperties } from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export type Beat = { name: string; at: number };
export const INTRO_SECONDS = 2.5;
const chapters: Record<string, { title: string; detail: string; section: number }> = {
  overview: { title: "See your cluster come alive.", detail: "Every whale is a pod. Every bubble is a namespace.", section: 0 },
  filter: { title: "Find the signal.", detail: "Filter workloads without losing the bigger picture.", section: 0 },
  radar: { title: "Locate. Select. Explore.", detail: "A spatial radar for the workloads you care about.", section: 0 },
  inspect: { title: "Get closer to the problem.", detail: "Inspect pod status, resources and controller identity.", section: 1 },
  dive: { title: "Take the controls.", detail: "Pilot the submarine. Keep the target in sight.", section: 1 },
  request: { title: "Request accepted.", detail: "A simulated request. Recovery still needs to be observed.", section: 2 },
  absent: { title: "Original pod absent.", detail: "The stream confirms the original pod is gone.", section: 2 },
  candidate: { title: "A new replica appears.", detail: "A new UID, observed under the same controller.", section: 2 },
  ready: { title: "Ready. Observed.", detail: "Follow the evidence from the request to a Ready replica.", section: 2 },
  closing: { title: "Dive into your Kubernetes cluster.", detail: "Try the browser demo · no Kubernetes setup required.", section: 2 },
};

export const KubeAquariumDemo = ({ beats }: { beats: Beat[] }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const introFrames = Math.round(INTRO_SECONDS * fps);
  const start = beats[0].at;
  const time = Math.max(0, frame - introFrames) / fps + start;
  const active = [...beats].reverse().find((beat) => time >= beat.at) ?? beats[0];
  const chapter = chapters[active.name];
  const sinceBeat = Math.max(0, time - active.at) * fps;
  const captionIn = interpolate(sinceBeat, [0, 9], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const progress = Math.min(1, frame / (durationInFrames - 1));
  const introIn = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return <AbsoluteFill style={styles.root}>
    <div style={styles.halo} />
    <div style={styles.header}>
      <span style={styles.brand}>kubeaquarium<span style={{ color: "#64e9dd" }}>.</span></span>
      <span style={styles.badge}><span style={styles.dot} /> SIMULATED DEMO · NO CLUSTER CHANGES</span>
    </div>
    <Sequence durationInFrames={introFrames}>
      <div style={{ ...styles.intro, opacity: introIn, transform: "translateY(" + (1 - introIn) * 24 + "px)" }}>
        <div style={styles.eyebrow}>KUBERNETES, MADE VISIBLE</div>
        <div style={styles.headline}>Your cluster.<br /><span style={{ color: "#64e9dd" }}>In motion.</span></div>
        <p style={styles.introCopy}>Explore workloads. Investigate failures.<br />Watch recovery happen.</p>
      </div>
      <div style={{ position: "absolute", right: 115, top: 220, width: 420, height: 420 }}>
        {[0, 1, 2, 3].map((ring) => <div key={ring} style={{ position: "absolute", inset: ring * 46, borderRadius: "50%", border: "1px solid rgba(100,233,221," + (0.15 + ring * 0.05) + ")", transform: "scale(" + (0.95 + introIn * 0.05) + ")" }} />)}
        <div style={{ position: "absolute", left: 199, top: 199, width: 22, height: 22, background: "#64e9dd", borderRadius: "50%", boxShadow: "0 0 55px #35c9d9" }} />
      </div>
      <div style={styles.introFoot}>EXPLORE &nbsp; / &nbsp; INSPECT &nbsp; / &nbsp; RECOVER</div>
    </Sequence>
    <Sequence from={introFrames}>
      <div style={styles.videoFrame}>
        <Video muted trimBefore={Math.round(start * fps)} src={staticFile("kubeaquarium-footage.webm")} style={{ width: "100%", height: "100%" }} />
      </div>
      <div style={styles.footer}>
        <div style={{ opacity: captionIn, transform: "translateY(" + (1 - captionIn) * 7 + "px)" }}>
          <div style={styles.caption}>{chapter.title}</div>
          <div style={styles.detail}>{chapter.detail}</div>
        </div>
        <div style={styles.chapters}>
          {["EXPLORE", "INSPECT", "RECOVER"].map((label, i) => <span key={label} style={{ color: i === chapter.section ? "#64e9dd" : "#7792a7", borderTop: "2px solid " + (i <= chapter.section ? "#64e9dd" : "#243b4b"), paddingTop: 12 }}>{"0" + (i + 1)} {label}</span>)}
        </div>
      </div>
    </Sequence>
    <div style={{ position: "absolute", bottom: 0, left: 0, height: 3, width: progress * 100 + "%", background: "#64e9dd" }} />
  </AbsoluteFill>;
};

const styles: Record<string, CSSProperties> = {
  root: { background: "#04101b", color: "#edf7ff", fontFamily: "Inter, system-ui, sans-serif" },
  halo: { position: "absolute", inset: 0, background: "radial-gradient(ellipse at 76% 20%, #0d3544 0%, transparent 62%)" },
  header: { position: "absolute", left: 60, right: 60, top: 26, display: "flex", justifyContent: "space-between", alignItems: "center" },
  brand: { fontSize: 28, fontWeight: 750, letterSpacing: -1 },
  badge: { fontFamily: "ui-monospace, monospace", fontSize: 12, letterSpacing: 1.5, display: "flex", alignItems: "center", gap: 10, color: "#9ac5cd" },
  dot: { width: 7, height: 7, borderRadius: "50%", background: "#64e9dd" },
  videoFrame: { position: "absolute", left: 80, top: 86, width: 1280, height: 720, borderRadius: 14, overflow: "hidden", boxShadow: "0 0 0 1px #345064, 0 20px 70px #0008" },
  footer: { position: "absolute", left: 80, right: 80, top: 835, display: "flex", justifyContent: "space-between", alignItems: "center" },
  caption: { fontSize: 27, fontWeight: 700, letterSpacing: -0.5 },
  detail: { fontSize: 15, color: "#a2b7c9", marginTop: 7 },
  chapters: { display: "flex", gap: 22, fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: 1 },
  intro: { position: "absolute", left: 90, top: 220 },
  eyebrow: { fontFamily: "ui-monospace, monospace", color: "#9ac5cd", fontSize: 16, letterSpacing: 3 },
  headline: { fontSize: 104, lineHeight: 1.06, fontWeight: 780, letterSpacing: -6, marginTop: 22 },
  introCopy: { fontSize: 24, color: "#a2b7c9", lineHeight: 1.6, marginTop: 28 },
  introFoot: { position: "absolute", left: 90, bottom: 80, fontFamily: "ui-monospace, monospace", fontSize: 14, letterSpacing: 3, color: "#64e9dd" },
};
