import assetUrl from "./icons/studio.svg?url";
import spriteMarkup from "./icons/studio.svg?raw";
import manifest from "./manifest.json";
import proposalMarkup from "../components/template/icons/pile-plan-proposals.svg?raw";
import simpleControlsMarkup from "../components/template/icons/simple-controls.svg?raw";
import algorithmDiagramsMarkup from "../components/domain/right-panel/cptAlgorithmDiagrams.svg?raw";

const sprite = manifest.generated.find(file => file.path === "icons/studio.svg");
if (!sprite) throw new Error("Blueprint sprite is missing from its generated manifest.");

// A warm browser keeps an external SVG document when a <use> URL stays unchanged.
// Include its content hash so newly synced symbols also appear during live updates.
const platform = import.meta.env.MODE === "platform";
const spriteUrl = platform ? "" : `${assetUrl}${assetUrl.includes("?") ? "&" : "?"}v=${sprite.sha256}`;

function installSprite(markup: string, prefix = "") {
  const svg = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
  if (prefix) {
    for (const element of svg.querySelectorAll("[id]")) element.id = prefix + element.id;
    for (const element of svg.querySelectorAll('[href^="#"]')) {
      element.setAttribute("href", "#" + prefix + element.getAttribute("href")!.slice(1));
    }
  }
  svg.setAttribute("style", "display: none");
  svg.setAttribute("aria-hidden", "true");
  document.body.prepend(svg);
}

export function installPlatformSprites() {
  if (!platform) return;
  // An opaque-origin frame cannot load external SVG references.
  installSprite(spriteMarkup);
  // Local proposals intentionally reuse several Blueprint symbol names.
  installSprite(proposalMarkup, "proposal-");
  installSprite(simpleControlsMarkup);
  installSprite(algorithmDiagramsMarkup);
}
export default spriteUrl;
