import assetUrl from "./icons/pile-plan-proposals.svg?url&no-inline";
import artwork from "./icons/pile-plan-proposals.svg?raw";
import "./BlueprintIcon.css";

// Refresh external SVG references when local artwork changes in the viewer.
const version = Array.from(artwork).reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(16);
const spriteUrl = `${assetUrl}${assetUrl.includes("?") ? "&" : "?"}v=${version}`;

export type PilePlanIconId = "pile.options" | "pile.cpts" | "pile.cap-changes" |
  "pile.compression" | "pile.tension" | "edit.select-rectangle" |
  "pile.cpt-settings" | "pile.cost-settings" | "pile.group-settings" |
  "data.apply" | "pile.tip-regions" | "pile.load-groups";

/** Reviewed local candidates; kept separate from the pinned Blueprint assets. */
export default function PilePlanIcon({ id, size = 24 }: { id: PilePlanIconId; size?: 16 | 24 }) {
  const sprite = import.meta.env.MODE === "platform" ? "#proposal-" : spriteUrl + "#";
  return <svg className="blueprint-icon pile-plan-icon" width={size} height={size}
    viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false" stroke="none">
    <use href={`${sprite}i${size}-${id}`} />
  </svg>;
}
