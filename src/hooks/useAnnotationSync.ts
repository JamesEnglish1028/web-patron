/**
 * useAnnotationSync — syncs reader annotations (last position, bookmarks,
 * notes/citations) with the Palace Manager annotation service.
 *
 * Design principles:
 *  - **Local-first**: localStorage is always written first; API calls are
 *    fire-and-forget. Readers never wait on the network.
 *  - **Graceful degradation**: if `annotationServiceUrl` is absent (open-
 *    access book, unauthenticated, older CM) the hook is a no-op and callers
 *    continue using localStorage-only storage unchanged.
 *  - **Server wins on load**: for last reading position, the server value
 *    takes precedence on mount if it is more recent than the local value.
 *    For bookmarks and notes the merge is additive (union by local ID).
 */

import * as React from "react";
import useUser from "components/context/UserContext";
import {
  fetchAnnotations,
  createAnnotation,
  deleteAnnotation,
  MOTIVATION_IDLING,
  MOTIVATION_BOOKMARKING,
  MOTIVATION_COMMENTING,
  type W3CAnnotation,
  type AnnotationMotivation,
  type AnyLocatorSelector
} from "utils/annotationApi";
import {
  type ReaderBookmark,
  type ReaderCitation,
  loadBookmarks,
  saveBookmarks,
  loadCitations,
  saveCitations
} from "utils/readerAnnotations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MediaType = "epub" | "pdf" | "audio";

export type EpubPosition = {
  cfi: string;
  /** CFI-based progress (0–100) */
  progressPercent?: number;
};

export type PdfPosition = {
  pageNumber: number;
  numPages?: number;
};

export type AudioPosition = {
  trackIndex: number;
  time: number;
  chapterTitle?: string;
};

export type AnyPosition = EpubPosition | PdfPosition | AudioPosition;

// ---------------------------------------------------------------------------
// Selector builders (position → W3C selector)
// ---------------------------------------------------------------------------

function epubSelector(pos: EpubPosition): AnyLocatorSelector {
  return {
    type: "FragmentSelector",
    conformsTo: "http://www.idpf.org/epub/linking/cfi/epub-cfi.html",
    value: pos.cfi
  };
}

function pdfSelector(pos: PdfPosition): AnyLocatorSelector {
  return {
    type: "FragmentSelector",
    conformsTo: "http://www.w3.org/TR/media-frags/",
    value: `page=${pos.pageNumber}`
  };
}

function audioSelector(pos: AudioPosition): AnyLocatorSelector {
  return {
    type: "FragmentSelector",
    conformsTo: "http://www.w3.org/TR/media-frags/",
    value: `t=${pos.time}`,
    additionalData: {
      chapterIndex: pos.trackIndex,
      progressWithinChapter: pos.time,
      chapterTitle: pos.chapterTitle
    }
  };
}

function buildSelector(
  mediaType: MediaType,
  position: AnyPosition
): AnyLocatorSelector {
  if (mediaType === "epub") return epubSelector(position as EpubPosition);
  if (mediaType === "pdf") return pdfSelector(position as PdfPosition);
  return audioSelector(position as AudioPosition);
}

// ---------------------------------------------------------------------------
// Annotation builder
// ---------------------------------------------------------------------------

function buildAnnotation(
  motivation: AnnotationMotivation,
  bookId: string,
  mediaType: MediaType,
  position: AnyPosition,
  bodyText?: string
): Omit<W3CAnnotation, "id"> {
  const annotation: Omit<W3CAnnotation, "id"> = {
    "@context": "http://www.w3.org/ns/anno.jsonld",
    type: "Annotation",
    motivation,
    target: {
      source: bookId,
      selector: buildSelector(mediaType, position)
    }
  };
  if (bodyText) {
    annotation.body = {
      type: "TextualBody",
      value: bodyText,
      format: "text/plain"
    };
  }
  return annotation;
}

// ---------------------------------------------------------------------------
// Position extraction from server annotations
// ---------------------------------------------------------------------------

function extractEpubCfi(annotation: W3CAnnotation): string | null {
  const selector = annotation.target?.selector;
  if (
    selector?.type === "FragmentSelector" &&
    selector.conformsTo === "http://www.idpf.org/epub/linking/cfi/epub-cfi.html"
  ) {
    return selector.value ?? null;
  }
  return null;
}

function extractPdfPage(annotation: W3CAnnotation): number | null {
  const selector = annotation.target?.selector;
  if (
    selector?.type === "FragmentSelector" &&
    selector.conformsTo === "http://www.w3.org/TR/media-frags/"
  ) {
    const match = /^page=(\d+)$/.exec(selector.value ?? "");
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function extractAudioPosition(
  annotation: W3CAnnotation
): { trackIndex: number; time: number } | null {
  const selector = annotation.target?.selector;
  if (
    selector?.type === "FragmentSelector" &&
    selector.conformsTo === "http://www.w3.org/TR/media-frags/"
  ) {
    const timeMatch = /^t=([\d.]+)$/.exec(selector.value ?? "");
    if (timeMatch) {
      const additional = (selector as any).additionalData;
      return {
        trackIndex: additional?.chapterIndex ?? 0,
        time: parseFloat(timeMatch[1])
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Merge helpers
// ---------------------------------------------------------------------------

/**
 * Merge server bookmarks (EPUB: ReaderBookmark[]) with local ones.
 * Union by CFI — neither side is deleted; server items are prepended.
 */
function mergeEpubBookmarks(
  local: ReaderBookmark[],
  serverAnnotations: W3CAnnotation[]
): ReaderBookmark[] {
  const serverBookmarks = serverAnnotations
    .filter(a => a.motivation === MOTIVATION_BOOKMARKING)
    .map<ReaderBookmark | null>(a => {
      const cfi = extractEpubCfi(a);
      if (!cfi) return null;
      return {
        id: a.id ?? `server-${cfi}`,
        cfi,
        label: a.body?.value ?? "Bookmark",
        createdAt: Date.now()
      };
    })
    .filter((b): b is ReaderBookmark => b !== null);

  const localCfis = new Set(local.map(b => b.cfi));
  const newFromServer = serverBookmarks.filter(b => !localCfis.has(b.cfi));
  return [...newFromServer, ...local];
}

/**
 * Merge server citations (EPUB: ReaderCitation[]) with local ones.
 * Union by CFI.
 */
function mergeEpubCitations(
  local: ReaderCitation[],
  serverAnnotations: W3CAnnotation[]
): ReaderCitation[] {
  const serverCitations = serverAnnotations
    .filter(a => a.motivation === MOTIVATION_COMMENTING)
    .map<ReaderCitation | null>(a => {
      const cfi = extractEpubCfi(a);
      if (!cfi) return null;
      return {
        id: a.id ?? `server-${cfi}`,
        cfi,
        note: a.body?.value ?? "",
        createdAt: Date.now()
      };
    })
    .filter((c): c is ReaderCitation => c !== null);

  const localCfis = new Set(local.map(c => c.cfi));
  const newFromServer = serverCitations.filter(c => !localCfis.has(c.cfi));
  return [...newFromServer, ...local];
}

// ---------------------------------------------------------------------------
// Resume-prompt helpers
// ---------------------------------------------------------------------------

/** Minimal time formatter for audio position labels (no external dependency). */
function formatAudioTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Returns true when the server-reported position is ahead of what this
 * browser session has stored locally.  "Ahead" means:
 * - EPUB  : server CFI differs from the locally persisted CFI
 * - PDF   : server page number > locally persisted page number
 * - Audio : server track is later, or same track but ≥ 30 s further
 */
function isServerAheadOfLocal(
  mediaType: MediaType,
  serverPos: AnyPosition,
  bookKey: string
): boolean {
  try {
    if (mediaType === "epub") {
      const localCfi = localStorage.getItem(`reader:lastLocation:${bookKey}`);
      const serverCfi = (serverPos as EpubPosition).cfi;
      return !!localCfi && !!serverCfi && serverCfi !== localCfi;
    }
    if (mediaType === "pdf") {
      const raw = localStorage.getItem(`reader:pdf:lastPage:${bookKey}`);
      const localPage = raw ? parseInt(raw, 10) : 1;
      return (
        (serverPos as PdfPosition).pageNumber >
        (isNaN(localPage) ? 1 : localPage)
      );
    }
    if (mediaType === "audio") {
      const raw = localStorage.getItem(`reader:audio:position:${bookKey}`);
      const local = raw
        ? (JSON.parse(raw) as { trackIndex?: number; time?: number })
        : null;
      const localTrack = local?.trackIndex ?? 0;
      const localTime = local?.time ?? 0;
      const s = serverPos as AudioPosition;
      if (s.trackIndex > localTrack) return true;
      if (s.trackIndex === localTrack && s.time > localTime + 30) return true;
    }
  } catch {
    // ignore localStorage / JSON errors
  }
  return false;
}

/** Build a human-readable label for the server position resume prompt. */
function buildServerResumeLabel(
  mediaType: MediaType,
  serverPos: AnyPosition
): string {
  if (mediaType === "pdf") {
    return `page ${(serverPos as PdfPosition).pageNumber}`;
  }
  if (mediaType === "audio") {
    const p = serverPos as AudioPosition;
    const timeStr = formatAudioTime(p.time);
    return p.chapterTitle
      ? `${p.chapterTitle} at ${timeStr}`
      : `track ${p.trackIndex + 1} at ${timeStr}`;
  }
  // EPUB: can't easily express CFI as a human-readable position
  return "your last position on another device";
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export type UseAnnotationSyncOptions = {
  /** Unique key for the book — typically the content URL. */
  bookKey: string;
  /** Book identifier URI sent as `target.source` in annotations. */
  bookId: string;
  mediaType: MediaType;
};

export type UseAnnotationSyncResult = {
  /**
   * Sync last reading position to the server.
   * Throttled to at most one POST every 30 seconds — suitable for high-
   * frequency callers like `onTimeUpdate`. Always safe to call; excess calls
   * are silently discarded.
   */
  syncLastPosition: (position: AnyPosition) => void;
  /**
   * Immediately POST the current position to the server, bypassing the
   * throttle.  Use this for intentional "save points": pause, track change,
   * page close (`visibilitychange` / `pagehide`).
   */
  flushLastPosition: (position: AnyPosition) => void;
  /**
   * Sync a bookmark to the server.
   * Returns the annotation with server-assigned id after the API call resolves
   * (useful if the caller wants to store the server id for later deletion).
   * The local state is updated immediately regardless.
   */
  syncBookmark: (
    position: AnyPosition,
    localId: string,
    label?: string
  ) => Promise<string | null>;
  /** Delete a bookmark from the server using its server-assigned annotation URL. */
  removeServerBookmark: (serverAnnotationId: string) => Promise<void>;
  /** Sync a note/citation to the server. */
  syncNote: (
    position: AnyPosition,
    localId: string,
    bodyText: string
  ) => Promise<string | null>;
  /** Delete a note from the server using its server-assigned annotation URL. */
  removeServerNote: (serverAnnotationId: string) => Promise<void>;
  /**
   * Server-merged bookmarks (EPUB only).
   * Null while the initial merge has not yet completed.
   */
  mergedBookmarks: ReaderBookmark[] | null;
  /**
   * Server-merged citations (EPUB only).
   * Null while the initial merge has not yet completed.
   */
  mergedCitations: ReaderCitation[] | null;
  /**
   * Server last-position CFI/page/time for the book, resolved on mount.
   * Null if the server has no record or if the service is unavailable.
   */
  serverLastPosition: AnyPosition | null;
  /**
   * Non-null when the server holds a position that is ahead of the local
   * session (e.g. the patron continued reading on a mobile device).
   * Contains a human-readable label suitable for a resume prompt.
   * Becomes null after `dismissServerResume` is called.
   */
  serverResumeLabel: string | null;
  /** Dismiss the resume-from-server prompt without navigating. */
  dismissServerResume: () => void;
  /** True while the initial server fetch is in progress. */
  syncing: boolean;
};

// Map local IDs to the server-assigned annotation URL so deletes can target both.
type ServerIdMap = Record<string, string>;
const SERVER_ID_MAP_KEY = (bookKey: string) => `reader:serverIds:${bookKey}`;

function loadServerIdMap(bookKey: string): ServerIdMap {
  try {
    const raw = localStorage.getItem(SERVER_ID_MAP_KEY(bookKey));
    if (!raw) return {};
    return JSON.parse(raw) as ServerIdMap;
  } catch {
    return {};
  }
}

function saveServerIdMap(bookKey: string, map: ServerIdMap) {
  try {
    localStorage.setItem(SERVER_ID_MAP_KEY(bookKey), JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

export function useAnnotationSync({
  bookKey,
  bookId,
  mediaType
}: UseAnnotationSyncOptions): UseAnnotationSyncResult {
  const { annotationServiceUrl, token } = useUser();

  const [syncing, setSyncing] = React.useState(false);
  const [serverLastPosition, setServerLastPosition] =
    React.useState<AnyPosition | null>(null);
  const [serverResumeLabel, setServerResumeLabel] = React.useState<
    string | null
  >(null);
  const [mergedBookmarks, setMergedBookmarks] = React.useState<
    ReaderBookmark[] | null
  >(null);
  const [mergedCitations, setMergedCitations] = React.useState<
    ReaderCitation[] | null
  >(null);

  /** Timestamp of the last successful server position POST (for throttling). */
  const lastServerSyncRef = React.useRef<number>(0);
  /** Minimum ms between throttled server syncs. */
  const POSITION_SYNC_THROTTLE_MS = 30_000;

  // On mount: fetch server annotations and merge with local state.
  React.useEffect(() => {
    if (!annotationServiceUrl || !bookId) return;

    let active = true;
    setSyncing(true);

    const merge = async () => {
      const all = await fetchAnnotations(annotationServiceUrl, token);

      if (!active) return;

      // Filter to annotations for this specific book
      const forBook = all.filter(a => a.target?.source === bookId);

      // Last position (idling) — server wins if present
      const idlingAnnotation = forBook.find(
        a => a.motivation === MOTIVATION_IDLING
      );
      if (idlingAnnotation) {
        if (mediaType === "epub") {
          const cfi = extractEpubCfi(idlingAnnotation);
          if (cfi) {
            const resolved: EpubPosition = { cfi };
            setServerLastPosition(resolved);
            if (isServerAheadOfLocal(mediaType, resolved, bookKey)) {
              setServerResumeLabel(buildServerResumeLabel(mediaType, resolved));
            }
          }
        } else if (mediaType === "pdf") {
          const page = extractPdfPage(idlingAnnotation);
          if (page !== null) {
            const resolved: PdfPosition = { pageNumber: page };
            setServerLastPosition(resolved);
            if (isServerAheadOfLocal(mediaType, resolved, bookKey)) {
              setServerResumeLabel(buildServerResumeLabel(mediaType, resolved));
            }
          }
        } else if (mediaType === "audio") {
          const pos = extractAudioPosition(idlingAnnotation);
          if (pos) {
            setServerLastPosition(pos);
            if (isServerAheadOfLocal(mediaType, pos, bookKey)) {
              setServerResumeLabel(buildServerResumeLabel(mediaType, pos));
            }
          }
        }
      }

      // Bookmarks and citations (EPUB only for now)
      if (mediaType === "epub") {
        const localBookmarks = loadBookmarks(bookKey);
        const localCitations = loadCitations(bookKey);
        const merged = mergeEpubBookmarks(localBookmarks, forBook);
        const mergedCites = mergeEpubCitations(localCitations, forBook);
        setMergedBookmarks(merged);
        setMergedCitations(mergedCites);
        saveBookmarks(bookKey, merged);
        saveCitations(bookKey, mergedCites);
      }

      setSyncing(false);
    };

    merge();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotationServiceUrl, bookId, bookKey, mediaType]);

  // ---------------------------------------------------------------------------
  // Sync functions
  // ---------------------------------------------------------------------------

  /** Shared POST logic factored out so throttled and flush paths share it. */
  const postLastPosition = React.useCallback(
    (position: AnyPosition) => {
      if (!annotationServiceUrl || !bookId) return;
      lastServerSyncRef.current = Date.now();
      createAnnotation(
        annotationServiceUrl,
        buildAnnotation(MOTIVATION_IDLING, bookId, mediaType, position),
        token
      );
    },
    [annotationServiceUrl, bookId, mediaType, token]
  );

  const syncLastPosition = React.useCallback(
    (position: AnyPosition) => {
      if (Date.now() - lastServerSyncRef.current < POSITION_SYNC_THROTTLE_MS)
        return;
      postLastPosition(position);
    },

    [postLastPosition]
  );

  const flushLastPosition = React.useCallback(
    (position: AnyPosition) => {
      postLastPosition(position);
    },
    [postLastPosition]
  );

  const syncBookmark = React.useCallback(
    async (
      position: AnyPosition,
      localId: string,
      label?: string
    ): Promise<string | null> => {
      if (!annotationServiceUrl || !bookId) return null;
      const serverAnnotation = await createAnnotation(
        annotationServiceUrl,
        buildAnnotation(
          MOTIVATION_BOOKMARKING,
          bookId,
          mediaType,
          position,
          label
        ),
        token
      );
      if (serverAnnotation?.id) {
        const map = loadServerIdMap(bookKey);
        map[localId] = serverAnnotation.id;
        saveServerIdMap(bookKey, map);
        return serverAnnotation.id;
      }
      return null;
    },
    [annotationServiceUrl, bookId, bookKey, mediaType, token]
  );

  const removeServerBookmark = React.useCallback(
    async (serverAnnotationId: string): Promise<void> => {
      if (!serverAnnotationId) return;
      await deleteAnnotation(serverAnnotationId, token);
    },
    [token]
  );

  const syncNote = React.useCallback(
    async (
      position: AnyPosition,
      localId: string,
      bodyText: string
    ): Promise<string | null> => {
      if (!annotationServiceUrl || !bookId) return null;
      const serverAnnotation = await createAnnotation(
        annotationServiceUrl,
        buildAnnotation(
          MOTIVATION_COMMENTING,
          bookId,
          mediaType,
          position,
          bodyText
        ),
        token
      );
      if (serverAnnotation?.id) {
        const map = loadServerIdMap(bookKey);
        map[localId] = serverAnnotation.id;
        saveServerIdMap(bookKey, map);
        return serverAnnotation.id;
      }
      return null;
    },
    [annotationServiceUrl, bookId, bookKey, mediaType, token]
  );

  const removeServerNote = React.useCallback(
    async (serverAnnotationId: string): Promise<void> => {
      if (!serverAnnotationId) return;
      await deleteAnnotation(serverAnnotationId, token);
    },
    [token]
  );

  const dismissServerResume = React.useCallback(() => {
    setServerResumeLabel(null);
  }, []);

  return {
    syncLastPosition,
    flushLastPosition,
    syncBookmark,
    removeServerBookmark,
    syncNote,
    removeServerNote,
    mergedBookmarks,
    mergedCitations,
    serverLastPosition,
    serverResumeLabel,
    dismissServerResume,
    syncing
  };
}
