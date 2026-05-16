import { type ThemeUIStyleObject } from "theme-ui";
import type React from "react";

// epubjs type shims
// epubjs ships no TypeScript types. These interfaces describe only the subset
// of the API that EpubReader uses. All fields are optional so the casts remain
// safe if an older or newer epubjs version omits a method.

export type InputBoxProps =
  | ({ as: "input" } & React.InputHTMLAttributes<HTMLInputElement> & {
        sx?: ThemeUIStyleObject;
      })
  | ({ as: "textarea" } & React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
        sx?: ThemeUIStyleObject;
      });

export type EpubReaderProps = {
  url: string;
  authToken?: string;
  title?: string;
  bookUrl?: string;
  setLoading: (value: boolean) => void;
};

export type EpubSpineItem = {
  href?: string;
  cfiBase?: string;
};

export type EpubTocItem = {
  id?: string;
  label?: string;
  title?: string;
  href?: string;
  cfi?: string;
  subitems?: EpubTocItem[];
  pageNumber?: number;
  locationIndex?: number;
};

export type EpubSearchResult = {
  cfi?: string;
  excerpt?: string;
  text?: string;
};

export type EpubRelocation = {
  start?: {
    cfi?: string;
    href?: string;
    displayed?: {
      page?: number;
      total?: number;
    };
  };
};

export type EpubThemesApi = {
  select?: (theme: "light" | "dark") => void;
  register?: (themeName: string, rules: Record<string, unknown>) => void;
  fontSize?: (size: string) => void;
  font?: (fontFamily: string) => void;
};

export type EpubContentsLike = {
  // epubjs Contents exposes the iframe document directly and via .window
  document?: Document;
  window?: Window & typeof globalThis;
  // addStylesheetCss(css, key) injects a <style> into the content document
  addStylesheetCss?: (css: string, key: string) => void;
};

export type EpubRenditionLike = {
  themes?: EpubThemesApi;
  views?: () => Array<{ document?: Document }>;
  on?: (event: string, callback: (...args: any[]) => void) => void;
  display: (target?: string) => Promise<unknown> | unknown;
  prev?: () => void;
  next?: () => void;
  spread?: (mode: "auto" | "none") => void;
  destroy?: () => void;
  hooks?: {
    content?: {
      register?: (fn: (contents: EpubContentsLike) => void) => void;
    };
  };
};

export type EpubBookLike = {
  locations?: {
    generate?: (chars?: number) => Promise<unknown> | unknown;
    locationFromCfi?: (cfi: string) => unknown;
    percentageFromCfi?: (cfi: string) => number | undefined;
    length?: () => number;
  };
  spine?: {
    spineItems?: EpubSpineItem[];
  };
  navigation?: {
    toc?: EpubTocItem[];
  };
  loaded?: {
    metadata?: Promise<Record<string, unknown>>;
    navigation?: Promise<{ toc?: EpubTocItem[] }>;
  };
  renderTo?: (
    element: Element,
    options: {
      width: string;
      height: string;
      flow: string;
      spread: "auto" | "none";
    }
  ) => EpubRenditionLike;
  coverUrl?: () => Promise<string> | string;
  destroy?: () => void;
};
