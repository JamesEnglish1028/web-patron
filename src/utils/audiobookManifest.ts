export interface AudiobookTrack {
  href: string;
  title: string;
  type?: string;
  duration?: number;
}

export interface AudiobookTocItem {
  title: string;
  href: string;
}

export interface ParsedAudiobookManifest {
  title: string;
  author: string;
  description?: string;
  coverImageUrl?: string;
  tracks: AudiobookTrack[];
  toc: AudiobookTocItem[];
  raw: any;
}

const decodeInput = (input: ArrayBuffer | string): string => (
  typeof input === 'string' ? input : new TextDecoder().decode(new Uint8Array(input))
);

const resolveHref = (href: string, baseUrl?: string): string => {
  if (!baseUrl) return href;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
};

const pickAuthor = (metadata: any): string => {
  if (typeof metadata?.author === 'string' && metadata.author.trim()) return metadata.author.trim();
  if (Array.isArray(metadata?.author) && metadata.author.length > 0) {
    const first = metadata.author[0];
    if (typeof first === 'string' && first.trim()) return first.trim();
    if (typeof first?.name === 'string' && first.name.trim()) return first.name.trim();
  }
  if (Array.isArray(metadata?.contributor)) {
    const primary = metadata.contributor.find((entry: any) => {
      const role = String(entry?.role || '').toLowerCase();
      return role.includes('author');
    }) || metadata.contributor[0];
    if (typeof primary === 'string' && primary.trim()) return primary.trim();
    if (typeof primary?.name === 'string' && primary.name.trim()) return primary.name.trim();
  }
  return 'Unknown Author';
};

const extractCoverImageUrl = (payload: any, baseUrl?: string): string | undefined => {
  const candidates = [
    ...(Array.isArray(payload?.links) ? payload.links : []),
    ...(Array.isArray(payload?.resources) ? payload.resources : []),
  ];
  for (const candidate of candidates) {
    const rels = Array.isArray(candidate?.rel) ? candidate.rel : [candidate?.rel];
    if (rels.some((value: any) => String(value || '').toLowerCase().includes('cover'))) {
      const href = String(candidate?.href || '').trim();
      if (href) return resolveHref(href, baseUrl);
    }
  }
  return undefined;
};

export const parseAudiobookManifest = (
  input: ArrayBuffer | string,
  baseUrl?: string,
): ParsedAudiobookManifest => {
  const text = decodeInput(input).trim();
  if (!text) {
    throw new Error('Audiobook manifest is empty.');
  }

  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Audiobook manifest is not valid JSON.');
  }

  const metadata = payload?.metadata || {};
  const readingOrder = Array.isArray(payload?.readingOrder)
    ? payload.readingOrder
    : Array.isArray(payload?.spine)
      ? payload.spine
      : [];
  const tracks: AudiobookTrack[] = readingOrder
    .map((entry: any, index: number) => {
      const href = typeof entry === 'string' ? entry : String(entry?.href || '').trim();
      if (!href) return null;
      const title = typeof entry?.title === 'string' && entry.title.trim()
        ? entry.title.trim()
        : `Track ${index + 1}`;
      const duration = Number(entry?.duration);
      return {
        href: resolveHref(href, baseUrl),
        title,
        type: typeof entry?.type === 'string' ? entry.type : undefined,
        duration: Number.isFinite(duration) ? duration : undefined,
      } satisfies AudiobookTrack;
    })
    .filter((entry: AudiobookTrack | null): entry is AudiobookTrack => entry !== null);

  if (tracks.length === 0) {
    throw new Error('Audiobook manifest does not include any playable tracks.');
  }

  const toc: AudiobookTocItem[] = (Array.isArray(payload?.toc) ? payload.toc : [])
    .map((entry: any) => {
      const title = String(entry?.title || '').trim();
      const href = String(entry?.href || '').trim();
      if (!title || !href) return null;
      return { title, href: resolveHref(href, baseUrl) };
    })
    .filter((entry: AudiobookTocItem | null): entry is AudiobookTocItem => entry !== null);

  return {
    title: String(metadata?.title || payload?.title || 'Untitled Audiobook').trim() || 'Untitled Audiobook',
    author: pickAuthor(metadata),
    description: typeof metadata?.description === 'string' ? metadata.description : undefined,
    coverImageUrl: extractCoverImageUrl(payload, baseUrl),
    tracks,
    toc,
    raw: payload,
  };
};
