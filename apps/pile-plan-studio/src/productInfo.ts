export const PRODUCT_INFO = Object.freeze({
  name: "Open Pile Plan Studio",
  version: __APP_VERSION__,
  status: __APP_RELEASE_STATUS__,
  organization: "OpenAEC Foundation",
  license: "LGPL-3.0-or-later",
});

export const PRODUCT_STATUS_KEY = PRODUCT_INFO.status === "Alpha" ? "alphaLabel" : "stableLabel";
