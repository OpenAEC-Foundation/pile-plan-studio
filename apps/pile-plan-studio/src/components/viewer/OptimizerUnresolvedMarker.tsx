import {
  getOptimizerUnresolvedMarkerStyle,
  type OptimizerUnresolvedMarkerPlacement,
} from "../../viewer/loadPointMarker.ts";
import { OPTIMIZER_QUESTION_PATH } from "../../viewer/optimizerMarkerGeometry.ts";

type Props = {
  placement?: OptimizerUnresolvedMarkerPlacement;
  label: string;
};

export default function OptimizerUnresolvedMarker({ placement = "map", label }: Props) {
  return (
    <span
      aria-label={label}
      className="optimizer-unresolved-marker"
      role="img"
      style={getOptimizerUnresolvedMarkerStyle(placement)}
    >
      <svg aria-hidden="true" focusable="false" viewBox="-12 -12 24 24">
        <g className="optimizer-marker-question">
          <path className="marker-halo" d={OPTIMIZER_QUESTION_PATH} />
          <circle className="marker-halo" cx="0" cy="6" r="0.9" />
          <path className="marker-foreground" d={OPTIMIZER_QUESTION_PATH} />
          <circle className="marker-foreground" cx="0" cy="6" r="0.9" />
        </g>
      </svg>
    </span>
  );
}
