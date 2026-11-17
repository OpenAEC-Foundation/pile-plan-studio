import { OPTIMIZER_QUESTION_PATH } from "../../../viewer/optimizerMarkerGeometry.ts";
import { memo } from "react";
import { getCptSymbolScale, getDashedOutlineDasharray } from "../../../viewer/markerGraphicGeometry.ts";
import { renderPileSymbolSvgChildren } from "../../../viewer/pileSymbols.ts";
import type { ViewerMarkerGraphic, ViewerMarkerHalo } from "./viewerMarkerPresentation.ts";

type Props = { graphics: ViewerMarkerGraphic[]; additionalHalos?: ViewerMarkerGraphic[] };
const GLOW_COLORS={above:"#c7352a",below:"#30994c",missing:"#ffc107"};
const DRIVING_HALO_STYLES = {
  good: { stroke: "#24864a", fill: "#24864a", dash: undefined },
  doubtful: { stroke: "#a38100", fill: "#ffdc38", dash: [5, 3] },
  deviation: { stroke: "#d3363e", fill: "#d3363e", dash: [1.5, 2.5] },
} as const;

function haloColors(halo: ViewerMarkerHalo) {
  if (halo.kind === "missing") {
    return {
      center: `rgba(255, 193, 7, 0.22)`,
      middle: `rgba(255, 193, 7, 0.22)`,
      edge: `rgba(255, 193, 7, 0.22)`,
      outline: `rgba(194, 130, 0, 0.72)`,
      glowOpacity: 0.32,
    };
  }
  const above = halo.kind === "above";
  const center = above ? "255, 230, 226" : "226, 248, 231";
  const middle = above ? "199, 53, 42" : "48, 153, 76";
  const edge = above ? "145, 31, 25" : "25, 112, 50";
  return {
    center: `rgba(${center}, ${0.2 + halo.intensity * 0.4})`,
    middle: `rgba(${middle}, ${0.12 + halo.intensity * 0.5})`,
    edge: `rgba(${edge}, ${0.08 + halo.intensity * 0.42})`,
    outline: `rgba(${middle}, ${0.18 + halo.intensity * 0.62})`,
    glowOpacity: 0.08 + halo.intensity * 0.42,
  };
}

const StatusHalo = memo(function StatusHalo({ graphic }: { graphic: ViewerMarkerGraphic }) {
  if (!graphic.halo) return null;
  const opacity = graphic.demandOpacity ?? 1;
  const radius = 9 * graphic.scale;
  const kind = graphic.halo.kind;
  if (kind === "good" || kind === "doubtful" || kind === "deviation") {
    const { stroke, fill, dash } = DRIVING_HALO_STYLES[kind];
    return <g transform={`translate(${graphic.x} ${graphic.y})`} opacity={opacity} data-driving-status={kind}>
      <circle r={radius + 2 * graphic.scale} fill={fill} fillOpacity={0.32} stroke={stroke}
        strokeWidth={2 * graphic.scale} strokeDasharray={dash?.map(length => length * graphic.scale).join(" ")} />
    </g>;
  }
  const colors = haloColors(graphic.halo);
  const gradientId = `viewer-status-halo-${graphic.id}`;
  return (
    <g transform={`translate(${graphic.x} ${graphic.y})`} opacity={opacity}>
      <defs>
        <radialGradient id={gradientId}>
          <stop offset="42%" stopColor={colors.center} />
          <stop offset="72%" stopColor={colors.middle} />
          <stop offset="100%" stopColor={colors.edge} />
        </radialGradient>
      </defs>
      <circle r={radius + 9 * graphic.scale} fill={`url(#viewer-status-glow-${graphic.halo.kind})`} opacity={colors.glowOpacity}/>
      <circle r={radius + graphic.scale} fill="none" stroke={colors.outline} strokeWidth={2 * graphic.scale} />
      <circle r={radius} fill={`url(#${gradientId})`} />
    </g>
  );
}, (a,b) => a.graphic.id===b.graphic.id && a.graphic.x===b.graphic.x && a.graphic.y===b.graphic.y
  && a.graphic.scale===b.graphic.scale && a.graphic.halo?.kind===b.graphic.halo?.kind
  && a.graphic.halo?.intensity===b.graphic.halo?.intensity
  && a.graphic.demandOpacity===b.graphic.demandOpacity);

const PileGraphic = memo(function PileGraphic({ graphic }: { graphic: ViewerMarkerGraphic }) {
  const { appearance, scale } = graphic;
  if (appearance.type === "pile") {
    const size = appearance.smallDot ? 6 : 12;
    const half = size * scale / 2;
    return (
      <g
        className="viewer-pile-symbol"
        transform={`translate(${-half} ${-half}) scale(${size * scale / 24})`}
        dangerouslySetInnerHTML={{
          __html: renderPileSymbolSvgChildren(
            appearance.symbol, appearance.color, `viewer-pile-${graphic.id}`,
          ),
        }}
      />
    );
  }
  if (appearance.type === "neutral") {
    return <circle r={3 * scale} fill="#8f999e" />;
  }
  if (appearance.type === "optimizer") {
    return (
      <g className="viewer-optimizer-symbol" transform={`scale(${16 * scale / 24})`}>
        <path className="marker-halo" d={OPTIMIZER_QUESTION_PATH} />
        <circle className="marker-halo" cx="0" cy="6" r="0.9" />
        <path className="marker-foreground" d={OPTIMIZER_QUESTION_PATH} />
        <circle className="marker-foreground" cx="0" cy="6" r="0.9" />
      </g>
    );
  }
  if (appearance.type === "error") {
    return (
      <g transform={`scale(${14 * scale / 24})`}>
        <path d="M-6-6L6 6M6-6L-6 6" fill="none" stroke={appearance.color} strokeLinecap="round" strokeWidth="4" />
      </g>
    );
  }
  return null;
}, sameSymbol);

const CptGraphic = memo(function CptGraphic({ graphic }: { graphic: ViewerMarkerGraphic }) {
  const { appearance, scale } = graphic;
  if (appearance.type !== "cpt") return null;
  const selected = appearance.selectedStyle && !appearance.inspectedOnly;
  const cptScale = getCptSymbolScale(scale);
  return (
    <g
      className={`viewer-cpt-triangle${selected ? " is-selected" : ""}`}
      transform={`translate(${-12 * cptScale} ${-11 * cptScale}) scale(${cptScale})`}
    >
      <polygon points="3,3 21,3 12,19" />
      <text className="viewer-cpt-label" x="12" y="9.5" style={{ fontSize: `${21 * appearance.labelScale}px` }}>
        {appearance.label}
      </text>
    </g>
  );
}, sameSymbol);

function sameSymbol(a:{graphic:ViewerMarkerGraphic}, b:{graphic:ViewerMarkerGraphic}) {
  if(a.graphic.id!==b.graphic.id || a.graphic.scale!==b.graphic.scale) return false;
  const left=a.graphic.appearance,right=b.graphic.appearance;
  if(left===right)return true;
  if(left.type!==right.type)return false;
  if(left.type==="pile" && right.type==="pile")return left.color===right.color && left.smallDot===right.smallDot
    && left.symbol.baseShape===right.symbol.baseShape && left.symbol.fillPattern===right.symbol.fillPattern;
  if(left.type==="cpt" && right.type==="cpt")return left.label===right.label && left.labelScale===right.labelScale
    && left.selectedStyle===right.selectedStyle && left.inspectedOnly===right.inspectedOnly;
  if(left.type==="error" && right.type==="error")return left.color===right.color;
  return true;
}

function LoadPointLock({ graphic }: { graphic: ViewerMarkerGraphic }) {
  const { x, y, scale, appearance } = graphic;
  const lockScale = appearance.type === "pile" && !appearance.smallDot ? scale : scale / 2;
  const cornerX = x + 3.6 * lockScale;
  const cornerY = y - 3.5 * lockScale;
  return <g className="viewer-load-point-lock" transform={`translate(${cornerX} ${cornerY}) scale(${lockScale})`}>
    <path d="M-1.5-.45v-.6a1.5 1.5 0 0 1 3 0v.6h.25a.5.5 0 0 1 .5.5v1.55a.5.5 0 0 1-.5.5h-3.5a.5.5 0 0 1-.5-.5V.05a.5.5 0 0 1 .5-.5z M-.8-.45H.8v-.6a.8.8 0 0 0-1.6 0z"
      fill="#172026" fillRule="evenodd" stroke="#f3f5f6" strokeWidth={0.65}
      strokeLinejoin="round" paintOrder="stroke"/>
  </g>;
}

const MarkerGraphic = memo(function MarkerGraphic({graphic}:{graphic:ViewerMarkerGraphic}) {
  const symbol = graphic.kind === "cpt" ? <CptGraphic graphic={graphic}/> : <PileGraphic graphic={graphic}/>;
  const symbolOpacity = graphic.demandOpacity ?? 1;
  return <g className={`viewer-marker-graphic is-${graphic.kind}`}
    transform={`translate(${graphic.x} ${graphic.y})`}>
    {graphic.ring ? <circle cx={0} cy={0} r={graphic.ring.radius} fill="none"
      stroke={graphic.ring.color === "context" ? "#738087" : "#ed7100"}
      strokeDasharray={graphic.ring.color === "context" ? getDashedOutlineDasharray(graphic.scale, 2) : undefined}
      strokeWidth={1}/> : null}
    {symbolOpacity === 1 ? symbol : <g opacity={symbolOpacity}>{symbol}</g>}
  </g>;
}, (a,b) => sameSymbol(a,b) && a.graphic.kind===b.graphic.kind && a.graphic.x===b.graphic.x
  && a.graphic.y===b.graphic.y && a.graphic.demandOpacity===b.graphic.demandOpacity
  && a.graphic.ring?.color===b.graphic.ring?.color && a.graphic.ring?.radius===b.graphic.ring?.radius);

export default function ViewerMarkerGraphics({ graphics, additionalHalos }: Props) {
  return (
    <g className="viewer-marker-graphics" aria-hidden="true">
      <defs>
        {Object.entries(GLOW_COLORS).map(([kind,color])=><radialGradient id={`viewer-status-glow-${kind}`} key={kind}>
          <stop offset="0%" stopColor={color} stopOpacity="0"/>
          <stop offset="45%" stopColor={color} stopOpacity="0.2"/>
          <stop offset="75%" stopColor={color} stopOpacity="0.08"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </radialGradient>)}
      </defs>
      <g className="viewer-status-halos">
        {graphics.map((graphic) => graphic.halo ? <StatusHalo graphic={graphic} key={graphic.key} /> : null)}
        {additionalHalos?.map(graphic => <StatusHalo graphic={graphic} key={graphic.key} />)}
      </g>
      {graphics.map((graphic) => <MarkerGraphic graphic={graphic} key={graphic.key}/>)}
      <g className="viewer-load-point-locks">
        {graphics.filter(graphic => graphic.locked).map(graphic => <LoadPointLock graphic={graphic} key={graphic.key}/>)}
      </g>
    </g>
  );
}
