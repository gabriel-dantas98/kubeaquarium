import "./index.css";
import { Composition } from "remotion";
import { KubeAquariumDemo } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="KubeAquariumDemo"
        component={KubeAquariumDemo}
        durationInFrames={1030}
        fps={24}
        width={960}
        height={540}
      />
    </>
  );
};
