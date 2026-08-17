import type { PresentedTipLevelRegionLayer } from "../../viewer/tipLevelRegionPresentation.ts";
import { buildTipLevelRegionSvgModel } from "./tipLevelRegionSvgModel.ts";

type Props = {
  layers: PresentedTipLevelRegionLayer[];
  width: number;
  height: number;
};

export default function TipLevelRegionOverlay({ layers, width, height }: Props) {
  const model = buildTipLevelRegionSvgModel(layers);
  if (model.groups.length === 0) return null;

  return (
    <svg
      aria-hidden={model.ariaHidden}
      className={model.className}
      focusable="false"
      viewBox={`0 0 ${width} ${height}`}
    >
      {model.groups.map((group) => (
        <g
          fill={group.fill}
          key={group.key}
          opacity={group.opacity}
          stroke={group.stroke}
        >
          {group.lines.map((line) => (
            <line
              key={line.key}
              strokeLinecap={line.strokeLinecap}
              strokeLinejoin={line.strokeLinejoin}
              strokeWidth={line.strokeWidth}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
            />
          ))}
          {group.circles.map((circle) => (
            <circle
              cx={circle.cx}
              cy={circle.cy}
              key={circle.key}
              r={circle.r}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}
