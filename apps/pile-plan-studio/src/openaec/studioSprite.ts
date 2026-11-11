import assetUrl from "./icons/studio.svg?url";
import spriteMarkup from "./icons/studio.svg?raw";
import manifest from "./manifest.json";
import proposalMarkup from "../components/template/icons/pile-plan-proposals.svg?raw";
import simpleControlsMarkup from "../components/template/icons/simple-controls.svg?raw";
import algorithmDiagramsMarkup from "../components/domain/right-panel/cptAlgorithmDiagrams.svg?raw";

const platform = import.meta.env.MODE === "platform";

function externalSpriteUrl() {
  const sprite = manifest.generated.find(file => file.path === "icons/studio.svg");
  if (!sprite) throw new Error("Blueprint sprite is missing from its generated manifest.");
  // Change the URL when the generated sprite changes to invalidate a warm browser's SVG cache.
  return `${assetUrl}${assetUrl.includes("?") ? "&" : "?"}v=${sprite.sha256}`;
}

// The platform installs the symbols inline. Its bundle can omit the external sprite manifest.
const spriteUrl = platform ? "" : externalSpriteUrl();

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
