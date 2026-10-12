export const LAYOUT_VERSION = 1;
export const LAYOUT_KINDS = ["video", "image", "gif", "story"] as const;
export const LAYOUT_SIZES = ["small", "medium", "large"] as const;
export const LAYOUT_SHAPES = ["square", "rounded", "pill"] as const;
export const LAYOUT_INSERTS = ["beforebegin", "afterbegin", "beforeend", "afterend"] as const;

export type LayoutKind = (typeof LAYOUT_KINDS)[number];
export type LayoutSize = (typeof LAYOUT_SIZES)[number];
export type LayoutShape = (typeof LAYOUT_SHAPES)[number];
export type LayoutInsert = (typeof LAYOUT_INSERTS)[number];
export type LayoutEntity = "Video" | "Image" | "Text";

export interface LayoutColors {
  background: string;
  text: string;
  icon: string;
  border: string;
  hoverBackground: string;
}

export interface LayoutTheme {
  dark?: string;
  light?: string;
}

export interface LayoutAnchor {
  selector: string;
  insert: LayoutInsert;
  replace: boolean;
  x?: number;
  y?: number;
}

export interface LayoutButton {
  size: LayoutSize;
  showText: boolean;
  label: string;
  shape: LayoutShape;
  scale: number;
  fit: boolean;
  hover: boolean;
  height?: number;
  width?: number;
  colors: LayoutColors;
  light?: LayoutColors;
  dark?: LayoutColors;
}

/** A validated, normalized target ready for the content script to place. */
export interface LayoutTarget {
  id: string;
  kind: LayoutKind;
  entity: LayoutEntity;
  path: string;
  anchor: LayoutAnchor;
  button: LayoutButton;
  theme?: LayoutTheme;
}

/** Shape of a `.lay` file once `validateLayout` reports no errors. */
export interface LayoutFile {
  version: typeof LAYOUT_VERSION;
  hosts: string[];
  theme?: LayoutTheme;
  targets: RawLayoutTarget[];
}

export interface RawLayoutTarget {
  id: string;
  kind: LayoutKind;
  path: string;
  anchor: { selector: string; insert: LayoutInsert; replace?: boolean; x?: number; y?: number };
  button: {
    size: LayoutSize;
    showText: boolean;
    label: string;
    shape: LayoutShape;
    scale?: number;
    fit?: boolean;
    hover?: boolean;
    height?: number;
    width?: number;
    colors: LayoutColors;
    light?: Partial<LayoutColors>;
    dark?: Partial<LayoutColors>;
  };
}
