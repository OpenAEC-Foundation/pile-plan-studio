import type { LoadPointGroupGeometry } from "../../../../viewer/loadPointGroupGeometry.ts";
import { buildLoadPointGroupSvgModel } from "./loadPointGroupSvgModel.ts";
import { memo } from "react";

type Props = {
  geometry: LoadPointGroupGeometry[];
};

const filters = buildLoadPointGroupSvgModel([]).filters;

const GroupPrimitive = memo(function GroupPrimitive({group}:{group:LoadPointGroupGeometry}) {
  const model = buildLoadPointGroupSvgModel([group]).groups[0];
  return <g id={model.primitiveId}>
    {model.facePath ? <path d={model.facePath}/> : null}
    {model.edgePath ? <path d={model.edgePath.d} fill="none" stroke="white"
      strokeLinecap={model.edgePath.strokeLinecap} strokeWidth={model.edgePath.strokeWidth}/> : null}
    {model.nodePath ? <path d={model.nodePath}/> : null}
  </g>;
}, (a,b)=>a.group.key===b.group.key && a.group.diameterPx===b.group.diameterPx
  && a.group.circles===b.group.circles && a.group.segments===b.group.segments && a.group.faces===b.group.faces);

const GroupContour = memo(function GroupContour({group}:{group:LoadPointGroupGeometry}) {
  const id=group.key.replace(/[^a-zA-Z0-9_-]/g,"-");
  const topCircle=group.hasConflict ? [...group.circles].sort((a,b)=>a.y-b.y || b.x-a.x)[0] : null;
  return <g className={`load-point-group-contour is-${group.state}`}>
    <use href={`#load-point-group-shape-${id}`} fill="white" filter={`url(#load-point-group-outline-${group.state})`}/>
    {topCircle ? <g aria-hidden="true" className="load-point-group-warning"
      transform={`translate(${topCircle.x+topCircle.radius+4} ${topCircle.y-topCircle.radius-4})`}>
      <circle r="6"/><text textAnchor="middle" y="3.5">!</text>
    </g> : null}
  </g>;
});

export default memo(function LoadPointGroupOverlay({ geometry }: Props) {
  if (geometry.length === 0) return null;

  return (
    <g className="load-point-group-overlay">
      <defs>
        {geometry.map(group=><GroupPrimitive group={group} key={group.key}/>)}
        {filters.map((filter) => (
          <filter
            colorInterpolationFilters="sRGB"
            height="200%"
            id={filter.id}
            key={filter.id}
            width="200%"
            x="-50%"
            y="-50%"
          >
            <feMorphology
              in="SourceAlpha"
              operator="dilate"
              radius={filter.ringWidthPx}
              result="expanded"
            />
            <feComposite in="expanded" in2="SourceAlpha" operator="out" result="ring" />
            <feFlood floodColor={filter.color} result="contour-color" />
            <feComposite in="contour-color" in2="ring" operator="in" />
          </filter>
        ))}
      </defs>
      {geometry.map(group=><GroupContour group={group} key={group.key}/>)}
    </g>
  );
});
