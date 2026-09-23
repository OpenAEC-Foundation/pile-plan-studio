import type { PresentedTipLevelRegionLayer } from "../../../../viewer/tipLevelRegionPresentation.ts";
import { buildTipLevelRegionSvgModel } from "./tipLevelRegionSvgModel.ts";

type Props = {
  layers: PresentedTipLevelRegionLayer[];
};

export default function TipLevelRegionOverlay({ layers }: Props) {
  const model = buildTipLevelRegionSvgModel(layers);
  if (model.groups.length === 0) return null;

  return (
    <g className={model.className}>
      {model.groups.map((group) => (
        <g
          key={group.key}
          opacity={group.opacity}
        >
          {group.facePath && (
            <path d={group.facePath} fill={group.color} stroke="none" />
          )}
          {group.edgePath && (
            <path
              d={group.edgePath.d}
              fill="none"
              stroke={group.color}
              strokeLinecap={group.edgePath.strokeLinecap}
              strokeWidth={group.edgePath.strokeWidth}
            />
          )}
          {group.nodePath && (
            <path d={group.nodePath} fill={group.color} stroke="none" />
          )}
        </g>
      ))}
    </g>
  );
}
