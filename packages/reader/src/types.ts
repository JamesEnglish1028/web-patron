export type ReaderEngine =
  | "epubjs"
  | "pdfjs"
  | "audiobook"
  | "webview"
  | "external"
  | "thorium"
  | "unknown";

export type AcquisitionRel = string | string[] | null | undefined;

export type AcquisitionLink = {
  href: string;
  type?: string | null;
  rel?: AcquisitionRel;
  profile?: string | null;
  templated?: boolean | null;
  template?: boolean | null;
  indirectionType?: string | null;
};

export type ReaderAction = {
  engine: ReaderEngine;
  href: string;
  reason: string;
  rel?: string[];
  type?: string;
  profile?: string;
  templated?: boolean;
  indirectionType?: string;
};

export type ReaderRouterRule = {
  id: string;
  engine: ReaderEngine;
  reason: string;
  priority?: number;
  match: (link: NormalizedAcquisitionLink) => boolean;
};

export type ReaderRouterOptions = {
  customRules?: ReaderRouterRule[];
  webpubEngine?: ReaderEngine;
};

export type NormalizedAcquisitionLink = {
  href: string;
  type: string;
  profile: string;
  rel: string[];
  templated: boolean;
  indirectionType: string;
};
