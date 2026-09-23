import { Video } from "@remotion/media";
import { useEffect, useState, type CSSProperties } from "react";
import { AbsoluteFill, Img, cancelRender, continueRender, delayRender, Easing, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import timing from "../timing.json";

export type Beat = { name: string; at: number };
export const INTRO_SECONDS = timing.introSeconds;
const ink = "#061c26", paper = "#edf0dc", mint = "#a8efbb", orange = "#ff9d62";
const chapters: Record<string, { title: string; detail: string; section: number }> = {
  overview: { title: "A living map of your cluster.", detail: "Whales are pods. Bubbles are namespaces. Explore the ocean between them.", section: 0 },
  filter: { title: "One namespace. A clearer view.", detail: "Isolate a workload without losing your bearings.", section: 0 },
  radar: { title: "Find it on the radar.", detail: "Select a workload. Follow its position through the ocean.", section: 0 },
  fleet: { title: "Choose your vessel.", detail: "Three vehicles. One ocean to explore.", section: 1 },
  inspect: { title: "Every whale has a story.", detail: "Read pod status, resource usage and controller identity.", section: 1 },
  dive: { title: "You have the helm.", detail: "Take the submarine down. Keep your selected pod in sight.", section: 1 },
  request: { title: "Request sent. Watch what follows.", detail: "Simulated termination accepted. Recovery is not yet confirmed.", section: 2 },
  absent: { title: "The original pod is gone.", detail: "Absence confirmed by the observed stream.", section: 2 },
  candidate: { title: "A new replica surfaces.", detail: "A different UID. The same controller. Readiness still pending.", section: 2 },
  ready: { title: "Recovery. Seen, not assumed.", detail: "The replacement replica is now observed Ready.", section: 2 },
  closing: { title: "Your next dive starts here.", detail: "Open the browser demo. No Kubernetes setup required.", section: 2 },
};
const reveal = (frame: number, start = 0, length = 20) => interpolate(frame, [start, start + length], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

function Chart({ frame }: { frame: number }) {
  return <svg viewBox="0 0 1440 940" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
    <defs><pattern id="chart" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M 80 0 L 0 0 0 80" fill="none" stroke={mint} strokeOpacity=".06" /></pattern></defs>
    <rect width="1440" height="940" fill="url(#chart)" />
    {[190, 265, 340].map((r) => <circle key={r} cx="1100" cy="470" r={r} stroke={mint} strokeOpacity=".14" fill="none" />)}
    <g transform={`rotate(${frame * .65} 1100 470)`}><path d="M1100 470 L1100 130 A340 340 0 0 1 1340 230 Z" fill={mint} opacity=".035" /><path d="M1100 470 L1100 130" stroke={mint} opacity=".3" /></g>
    {Array.from({ length: 36 }, (_, i) => <path key={i} d="M1100 115 v10" stroke={mint} strokeOpacity={i % 3 ? ".2" : ".5"} transform={`rotate(${i * 10} 1100 470)`} />)}
    <path d="M740 470h720M1100 100v740" stroke={mint} strokeOpacity=".1" strokeDasharray="3 8" />
  </svg>;
}
function Helm({ frame }: { frame: number }) {
  return <Img src={staticFile("kubernetes-helm.png")} style={{ width: 570, height: 570, objectFit: "contain", position: "absolute", right: 25, top: 175, opacity: reveal(frame, 5), transform: `translateY(${Math.sin(frame / 32) * 7}px) rotate(${interpolate(reveal(frame, 5), [0, 1], [-8, 0])}deg)` }} />;
}

export const KubeAquariumDemo = ({ beats }: { beats: Beat[] }) => {
  const [fontHandle] = useState(() => delayRender("Loading locally bundled launch typography"));
  useEffect(() => {
    Promise.all([new FontFace("Barlow", `url(${staticFile("fonts/Barlow-Regular.ttf")})`).load(), new FontFace("Barlow Condensed", `url(${staticFile("fonts/BarlowCondensed-SemiBold.ttf")})`, { weight: "600" }).load()]).then((fonts) => { fonts.forEach((font) => document.fonts.add(font)); continueRender(fontHandle); }).catch(cancelRender);
  }, [fontHandle]);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const introFrames = Math.round(INTRO_SECONDS * fps);
  const start = beats[0].at;
  const time = Math.max(0, frame - introFrames) / fps + start;
  const active = [...beats].reverse().find((beat) => time >= beat.at) ?? beats[0];
  const chapter = chapters[active.name];
  const captionIn = reveal((time - active.at) * fps, 0, 9);
  const progress = Math.min(1, frame / (durationInFrames - 1));
  const closing = active.name === "closing" && frame >= introFrames;
  return <AbsoluteFill style={styles.root}>
    <Chart frame={frame} />
    <div style={styles.header}>
      <div style={styles.brand}><span style={{ color: mint, marginRight: 10 }}>◒</span>kubeaquarium<span style={{ color: orange }}> /</span></div>
      <div style={styles.badge}><span style={styles.dot} /> SIMULATED DEMO <span style={{ opacity: .4 }}> / </span> NO CLUSTER CHANGES</div>
    </div>
    <Sequence durationInFrames={introFrames}>
      <Helm frame={frame} />
      <div style={{ ...styles.intro, opacity: reveal(frame), transform: `translateY(${(1 - reveal(frame)) * 35}px)` }}>
        <div style={styles.eyebrow}>KUBERNETES, BELOW THE SURFACE</div>
        <div style={styles.headline}>YOUR CLUSTER.<br /><span style={{ color: mint }}>AN OCEAN</span><br /><span style={{ color: mint }}>OF POSSIBILITIES.</span></div>
        <p style={{ ...styles.introCopy, opacity: reveal(frame, 14) }}>Explore your workloads. Take the helm.<br />Watch recovery unfold.</p>
      </div>
      <div style={{ position: "absolute", right: 100, top: 765, color: mint, fontSize: 13, letterSpacing: 2, opacity: reveal(frame, 24) }}>01 / TAKE THE HELM<br /><span style={{ display: "block", marginTop: 9, opacity: .5 }}>KUBERNETES, BELOW THE SURFACE</span></div>
      <div style={styles.introFoot}><span>EXPLORE THE CLUSTER</span><span style={{ color: orange }}>↓ DIVE IN</span></div>
    </Sequence>
    <Sequence from={introFrames}>
      <div style={{ ...styles.videoFrame, opacity: closing ? 1 - reveal((time - active.at) * fps, 0, 13) : 1 }}>
        <Video muted trimBefore={Math.round(start * fps)} src={staticFile("kubeaquarium-footage.webm")} style={{ width: "100%", height: "100%" }} />
      </div>
      {!closing && <><div style={styles.sideLabel}>FIELD NOTES / {"0" + (chapter.section + 1)}</div><div style={styles.footer}>
        <div style={{ opacity: captionIn, transform: `translateY(${(1 - captionIn) * 8}px)` }}>
          <div style={styles.caption}>{chapter.title}</div>
          <div style={styles.detail}>{chapter.detail}</div>
        </div>
        <div style={styles.chapters}>
          {["EXPLORE", "INSPECT", "RECOVER"].map((label, i) => <span key={label} style={{ color: i === chapter.section ? mint : "#6b9296", borderTop: `2px solid ${i <= chapter.section ? mint : "#28444a"}`, paddingTop: 10 }}><span style={{ color: i === chapter.section ? orange : "#6b9296" }}>{"0" + (i + 1)}</span><br />{label}</span>)}
        </div>
      </div></>}
      {closing && <div style={{ ...styles.closing, opacity: reveal((time - active.at) * fps, 5, 15) }}>
        <div style={styles.eyebrow}>THE OCEAN IS OPEN.</div>
        <div style={{ ...styles.headline, fontSize: 146, lineHeight: .95, marginTop: 30 }}>TAKE YOUR<br /><span style={{ color: mint }}>FIRST DIVE.</span></div>
        <div style={{ ...styles.introCopy, marginTop: 34 }}>Try the browser demo.<br />No Kubernetes setup required.</div>
        <div style={{ marginTop: 32, fontSize: 20, color: orange, letterSpacing: 2 }}>EXPLORE · INSPECT · RECOVER ↗</div>
        <Helm frame={frame} />
      </div>}
    </Sequence>
    <div style={{ position: "absolute", bottom: 0, left: 0, height: 4, width: progress * 100 + "%", background: orange }} />
  </AbsoluteFill>;
};

const styles: Record<string, CSSProperties> = {
  root: { background: ink, color: paper, fontFamily: "Barlow, sans-serif" },
  header: { position: "absolute", left: 60, right: 60, top: 24, display: "flex", justifyContent: "space-between", alignItems: "center" },
  brand: { fontFamily: "Barlow Condensed", fontSize: 32, fontWeight: 600, letterSpacing: -.5 },
  badge: { fontSize: 12, letterSpacing: 1.8, display: "flex", alignItems: "center", gap: 12, color: "#acc4bc" },
  dot: { width: 6, height: 6, borderRadius: "50%", background: mint },
  videoFrame: { position: "absolute", left: 80, top: 86, width: 1280, height: 720, overflow: "hidden", boxShadow: "0 0 0 1px #52716a" },
  sideLabel: { position: "absolute", left: 27, top: 805, transform: "rotate(-90deg)", transformOrigin: "left top", fontSize: 11, letterSpacing: 3, color: "#78978f" },
  footer: { position: "absolute", left: 80, right: 80, top: 827, display: "flex", justifyContent: "space-between", alignItems: "center" },
  caption: { fontFamily: "Barlow Condensed", fontSize: 36, fontWeight: 600, letterSpacing: -.3 },
  detail: { fontSize: 16, color: "#b2c5ba", marginTop: 5 },
  chapters: { display: "flex", gap: 25, fontSize: 11, letterSpacing: 1.8, lineHeight: 1.6 },
  intro: { position: "absolute", left: 80, top: 178 },
  eyebrow: { color: orange, fontSize: 14, letterSpacing: 3.5 },
  headline: { fontFamily: "Barlow Condensed", fontSize: 110, lineHeight: .98, fontWeight: 600, letterSpacing: -2.5, marginTop: 30 },
  introCopy: { fontSize: 24, color: "#b2c5ba", lineHeight: 1.4, marginTop: 30 },
  introFoot: { position: "absolute", left: 80, right: 80, bottom: 70, display: "flex", justifyContent: "space-between", borderTop: "1px solid #35544e", paddingTop: 20, fontSize: 13, letterSpacing: 3, color: "#8da69d" },
  closing: { position: "absolute", inset: 0, padding: "180px 80px 0" },
};
