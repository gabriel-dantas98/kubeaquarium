import "./index.css";
import { Composition } from "remotion";
import { KubeAquariumDemo } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="KubeAquariumDemo"
        component={KubeAquariumDemo}
        durationInFrames={540}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};
