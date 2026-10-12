/** Inline SVG markup for the in-page controls. Everything renders inside a shadow root. */

// Download arrow: Font Awesome Free 6.7.2, CC BY 4.0. https://fontawesome.com/license/free
export const DOWNLOAD_PATH =
  "M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 242.7-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7 288 32zM64 352c-35.3 0-64 28.7-64 64l0 32c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-32c0-35.3-28.7-64-64-64l-101.5 0-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352 64 352zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z";

export const CHECK_PATH =
  "M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z";

export const CROSS_PATH =
  "M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z";

/**
 * A single SVG that shows one of four glyphs depending on the `data-state` of its button:
 * idle (download arrow), busy (spinning ring), done (check), error (cross).
 */
export function stateIconSvg(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 512 512");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("cove-state-icon");

  const glyph = (d: string, name: string) => {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.dataset.glyph = name;
    svg.appendChild(path);
  };
  glyph(DOWNLOAD_PATH, "idle");
  glyph(CHECK_PATH, "done");
  glyph(CROSS_PATH, "error");

  const ring = document.createElementNS(ns, "circle");
  ring.setAttribute("cx", "256");
  ring.setAttribute("cy", "256");
  ring.setAttribute("r", "190");
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke-width", "56");
  ring.setAttribute("stroke-linecap", "round");
  ring.setAttribute("stroke-dasharray", "600 1200");
  ring.dataset.glyph = "busy";
  svg.appendChild(ring);
  return svg;
}

/** Styles for `stateIconSvg`, keyed off `button[data-state]`. Include once per shadow root. */
export const STATE_ICON_STYLE = `
  .cove-state-icon [data-glyph] { display: none; }
  button[data-state="idle"] .cove-state-icon [data-glyph="idle"],
  button:not([data-state]) .cove-state-icon [data-glyph="idle"] { display: block; }
  button[data-state="busy"] .cove-state-icon [data-glyph="busy"] {
    display: block;
    stroke: currentColor;
    transform-origin: 256px 256px;
    animation: cove-spin 0.9s linear infinite;
  }
  button[data-state="done"] .cove-state-icon [data-glyph="done"] { display: block; }
  button[data-state="error"] .cove-state-icon [data-glyph="error"] { display: block; }
  button[data-state="busy"] { cursor: progress; }
  @keyframes cove-spin { to { transform: rotate(360deg); } }
`;
