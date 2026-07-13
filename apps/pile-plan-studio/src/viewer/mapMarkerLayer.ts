export function getCptMarkerLayerClass(isSelected: boolean): string {
  return isSelected ? " is-layer-selected-cpt" : " is-layer-cpt";
}

export function getLoadPointMarkerLayerClass(isSelected: boolean): string {
  return isSelected ? " is-layer-selected-load-point" : " is-layer-load-point";
}
