import "./index.css";
import { Composition } from "remotion";
import { INTRO_SECONDS, KubeAquariumDemo, type Beat } from "./Composition";
import beats from "../public/kubeaquarium-beats.json";

const fps = 30;
const capturedBeats = beats as Beat[];
const last = capturedBeats[capturedBeats.length - 1];
if (!last || !Number.isFinite(last.at)) throw new Error("Capture beats must contain a final timestamp");
export const RemotionRoot: React.FC = () => <Composition id="KubeAquariumDemo" component={KubeAquariumDemo} durationInFrames={Math.ceil((INTRO_SECONDS + last.at + 3 - capturedBeats[0].at) * fps)} fps={fps} width={1440} height={940} defaultProps={{ beats: capturedBeats }} />;
