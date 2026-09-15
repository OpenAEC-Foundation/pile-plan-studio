import { elementLayoutScale, screenToLocal } from "../../../domain/settings/uiBaseline.ts";

export type LocalCanvasRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
};

export function getLocalCanvasRect(canvas: HTMLElement): LocalCanvasRect {
  return getLocalElementRect(canvas);
}

export function getLocalElementRect(element: Element): LocalCanvasRect {
  const rect = element.getBoundingClientRect();
  const scale = elementLayoutScale(document.documentElement);
  return {
    left: screenToLocal(rect.left, scale),
    top: screenToLocal(rect.top, scale),
    width: screenToLocal(rect.width, scale),
    height: screenToLocal(rect.height, scale),
    scale,
  };
}

export function getLocalPointer(clientX: number, clientY: number, rect: LocalCanvasRect) {
  return {
    x: screenToLocal(clientX, rect.scale) - rect.left,
    y: screenToLocal(clientY, rect.scale) - rect.top,
  };
}

export function getLocalViewportPointer(clientX: number, clientY: number, scale: number) {
  return {
    x: screenToLocal(clientX, scale),
    y: screenToLocal(clientY, scale),
  };
}
