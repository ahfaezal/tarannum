import React from "react";
import FullScreenTrainingMode, {
  type FullScreenTrainingModeProps,
} from "./FullScreenTrainingMode";

type PracticeFullScreenModeProps = Omit<
  FullScreenTrainingModeProps,
  "fullscreenContext"
>;

const PracticeFullScreenMode: React.FC<PracticeFullScreenModeProps> = (
  props
) => {
  return <FullScreenTrainingMode {...props} fullscreenContext='practice' />;
};

export default PracticeFullScreenMode;
