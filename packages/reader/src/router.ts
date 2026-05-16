import type {
  AcquisitionLink,
  NormalizedAcquisitionLink,
  ReaderAction,
  ReaderEngine,
  ReaderRouterOptions,
  ReaderRouterRule
} from "./types";

const normalizeRel = (rel: AcquisitionLink["rel"]): string[] => {
  if (!rel) return [];
  return Array.isArray(rel)
    ? rel.map(entry => String(entry).toLowerCase())
    : [String(rel).toLowerCase()];
};

const normalizeLink = (link: AcquisitionLink): NormalizedAcquisitionLink => ({
  href: link.href,
  type: String(link.type || "").toLowerCase(),
  profile: String(link.profile || "").toLowerCase(),
  rel: normalizeRel(link.rel),
  templated: Boolean(link.templated ?? link.template ?? false),
  indirectionType: String(link.indirectionType || "").toLowerCase()
});

const includesAny = (value: string, tokens: readonly string[]): boolean =>
  tokens.some(token => value.includes(token));

const buildDefaultRules = (webpubEngine: ReaderEngine): ReaderRouterRule[] => [
  {
    id: "adobe-drm",
    engine: "external",
    reason: "Adobe DRM is not supported for in-app reading.",
    priority: 100,
    match: link =>
      includesAny(link.indirectionType, ["adobe", "adept"]) ||
      includesAny(link.type, ["adobe", "adept"])
  },
  {
    id: "epub",
    engine: "epubjs",
    reason: "Matched EPUB media type.",
    priority: 50,
    match: link =>
      includesAny(link.type, ["application/epub+zip", "epub"]) &&
      !link.type.includes("webpub+json")
  },
  {
    id: "pdf",
    engine: "pdfjs",
    reason: "Matched PDF media type.",
    priority: 50,
    match: link => includesAny(link.type, ["application/pdf", "pdf"])
  },
  {
    id: "audiobook",
    engine: "audiobook",
    reason: "Matched audiobook media type.",
    priority: 45,
    match: link =>
      includesAny(link.type, [
        "application/audiobook+json",
        "application/audiobook+lcp",
        "audiobook+json",
        "audiobook+lcp"
      ])
  },
  {
    id: "webpub",
    engine: webpubEngine,
    reason: "Matched Readium Web Publication manifest.",
    priority: 40,
    match: link => includesAny(link.type, ["application/webpub+json"])
  },
  {
    id: "streaming-html",
    engine: "webview",
    reason: "Matched streaming HTML view.",
    priority: 30,
    match: link =>
      includesAny(link.type, ["text/html"]) &&
      includesAny(link.profile, ["streaming-media"])
  }
];

const pickBestCandidate = (
  candidates: Array<{
    action: ReaderAction;
    priority: number;
    linkIndex: number;
  }>
): ReaderAction | null => {
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.linkIndex - b.linkIndex;
  });
  return candidates[0].action;
};

export const resolveReaderAction = (
  links: AcquisitionLink[],
  options: ReaderRouterOptions = {}
): ReaderAction | null => {
  const webpubEngine = options.webpubEngine || "audiobook";
  const rules = [
    ...(options.customRules || []),
    ...buildDefaultRules(webpubEngine)
  ];

  const candidates: Array<{
    action: ReaderAction;
    priority: number;
    linkIndex: number;
  }> = [];

  links.forEach((link, linkIndex) => {
    const normalized = normalizeLink(link);
    rules.forEach(rule => {
      if (!rule.match(normalized)) return;
      candidates.push({
        action: {
          engine: rule.engine,
          href: normalized.href,
          reason: rule.reason,
          rel: normalized.rel,
          type: normalized.type,
          profile: normalized.profile,
          templated: normalized.templated,
          indirectionType: normalized.indirectionType
        },
        priority: rule.priority ?? 0,
        linkIndex
      });
    });
  });

  return pickBestCandidate(candidates);
};

export const addRule = (
  baseRules: ReaderRouterRule[],
  rule: ReaderRouterRule
): ReaderRouterRule[] => {
  return [...baseRules, rule];
};
