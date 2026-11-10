import { Button, OpenAECProvider, type ButtonProps } from "../../openaec/react/src/index";
import assetUrl from "./icons/simple-controls.svg?url&no-inline";
import artwork from "./icons/simple-controls.svg?raw";

// Invalidate the browser's SVG document cache after editing these local symbols.
const version = Array.from(artwork).reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(16);
const spriteUrl = import.meta.env.MODE === "platform" ? "" : `${assetUrl}${assetUrl.includes("?") ? "&" : "?"}v=${version}`;
export function SimpleIconAction(props: Omit<ButtonProps, "icon"> & { icon: "local.add" }) {
  return <OpenAECProvider sprite={spriteUrl}><Button {...props} /></OpenAECProvider>;
}
