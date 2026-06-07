import React from "react";
import FullScreenTrainingMode, {
  type FullScreenTrainingModeProps,
} from "./FullScreenTrainingMode";

type RecordingFullScreenModeProps = Omit<
  FullScreenTrainingModeProps,
  "fullscreenContext"
>;

const RecordingFullScreenMode: React.FC<RecordingFullScreenModeProps> = (
  props
) => {
  return <FullScreenTrainingMode {...props} fullscreenContext='recording' />;
};

export default RecordingFullScreenMode;
