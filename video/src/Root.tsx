import "./index.css";
import { Composition } from "remotion";
import { KubeAquariumDemo, type Beat } from "./Composition";
import beats from "../public/kubeaquarium-beats.json";

const fps = 24;
const capturedBeats = beats as Beat[];
const last = capturedBeats[capturedBeats.length - 1];
if (!last || !Number.isFinite(last.at)) throw new Error("Capture beats must contain a final timestamp");
export const RemotionRoot: React.FC = () => <Composition id="KubeAquariumDemo" component={KubeAquariumDemo} durationInFrames={Math.ceil((last.at + 2) * fps)} fps={fps} width={960} height={540} defaultProps={{ beats: capturedBeats }} />;
