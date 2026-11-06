import { Button, IconButton, OpenAECProvider, type ButtonProps, type IconButtonProps } from "../../openaec/react/src/index";
import assetUrl from "./icons/simple-controls.svg?url&no-inline";
import artwork from "./icons/simple-controls.svg?raw";

// Invalidate the browser's SVG document cache after editing these local symbols.
const version = Array.from(artwork).reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(16);
const spriteUrl = `${assetUrl}${assetUrl.includes("?") ? "&" : "?"}v=${version}`;
type SimpleIcon = "local.edit" | "local.filter" | "local.add";

export function SimpleIconButton(props: Omit<IconButtonProps, "icon"> & { icon: SimpleIcon }) {
  return <OpenAECProvider sprite={spriteUrl}><IconButton {...props} /></OpenAECProvider>;
}

export function SimpleIconAction(props: Omit<ButtonProps, "icon"> & { icon: SimpleIcon }) {
  return <OpenAECProvider sprite={spriteUrl}><Button {...props} /></OpenAECProvider>;
}
