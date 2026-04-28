/**
 * W3C Web Annotation Protocol client for the Palace Manager annotation service.
 *
 * The annotation service URL is scoped to the authenticated patron and is
 * retrieved from the loans feed (`http://www.w3.org/ns/oa#annotationService`).
 *
 * All functions degrade gracefully: network failures return null/undefined
 * rather than throwing, so readers always fall back to localStorage.
 *
 * @see https://www.w3.org/TR/annotation-protocol/
 */

/** Motivation values used by the Palace Manager annotation API. */
export const MOTIVATION_IDLING = "http://www.w3.org/ns/oa#idling";
export const MOTIVATION_BOOKMARKING = "http://www.w3.org/ns/oa#bookmarking";
export const MOTIVATION_COMMENTING = "http://www.w3.org/ns/oa#commenting";

export type AnnotationMotivation =
  | typeof MOTIVATION_IDLING
  | typeof MOTIVATION_BOOKMARKING
  | typeof MOTIVATION_COMMENTING;

/** A position selector for EPUB books (CFI-based). */
export type EpubLocatorSelector = {
  type: "FragmentSelector";
  conformsTo: "http://www.idpf.org/epub/linking/cfi/epub-cfi.html";
  value: string; // CFI string, e.g. "epubcfi(/6/4[chap01]!/4/2/2/1:0)"
};

/** A position selector for PDF books (page-based). */
export type PdfLocatorSelector = {
  type: "FragmentSelector";
  conformsTo: "http://www.w3.org/TR/media-frags/";
  value: string; // e.g. "page=42"
};

/** A position selector for audiobook tracks (time-based). */
export type AudioLocatorSelector = {
  type: "FragmentSelector";
  conformsTo: "http://www.w3.org/TR/media-frags/";
  value: string; // e.g. "t=3661.5" (seconds)
  additionalData?: {
    /** Zero-based track/chapter index */
    progressWithinChapter?: number;
    /** Human-readable chapter title */
    chapterTitle?: string;
    chapterIndex?: number;
  };
};

export type AnyLocatorSelector =
  | EpubLocatorSelector
  | PdfLocatorSelector
  | AudioLocatorSelector;

/** The annotation target (the book + position within it). */
export type AnnotationTarget = {
  /** The book's identifier URI */
  source: string;
  selector?: AnyLocatorSelector;
};

/**
 * A W3C Web Annotation.
 * `id` is assigned by the server on creation; omit it when POSTing new annotations.
 */
export type W3CAnnotation = {
  "@context": "http://www.w3.org/ns/anno.jsonld";
  type: "Annotation";
  id?: string;
  motivation: AnnotationMotivation;
  target: AnnotationTarget;
  body?: {
    type: "TextualBody";
    value: string;
    format?: "text/plain";
  };
};

/** A page of annotation results returned by the service. */
export type AnnotationPage = {
  "@context": "http://www.w3.org/ns/anno.jsonld";
  type: "AnnotationCollection" | "AnnotationPage";
  id?: string;
  total?: number;
  items?: W3CAnnotation[];
  first?: { items?: W3CAnnotation[] } | string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type":
      'application/ld+json; profile="http://www.w3.org/ns/anno.jsonld"',
    Accept:
      'application/ld+json; profile="http://www.w3.org/ns/anno.jsonld"'
  };
  if (token) {
    headers["Authorization"] = token;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all of the patron's annotations from the annotation service.
 * Returns an empty array on any failure.
 */
export async function fetchAnnotations(
  serviceUrl: string,
  token?: string
): Promise<W3CAnnotation[]> {
  try {
    const response = await fetch(serviceUrl, {
      headers: buildHeaders(token)
    });
    if (!response.ok) return [];
    const data: AnnotationPage = await response.json();
    // The CM may return either an AnnotationCollection with a nested first
    // page, or a flat AnnotationPage directly.
    const items =
      data.items ??
      (typeof data.first === "object" ? data.first?.items : undefined) ??
      [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

/**
 * POST a new annotation to the service.
 * Returns the server-assigned annotation (with `id`) or null on failure.
 */
export async function createAnnotation(
  serviceUrl: string,
  annotation: Omit<W3CAnnotation, "id">,
  token?: string
): Promise<W3CAnnotation | null> {
  try {
    const response = await fetch(serviceUrl, {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify(annotation)
    });
    if (!response.ok) return null;
    return (await response.json()) as W3CAnnotation;
  } catch {
    return null;
  }
}

/**
 * DELETE an annotation by its server-assigned URL/ID.
 * Returns true if the server confirmed deletion, false otherwise.
 */
export async function deleteAnnotation(
  annotationId: string,
  token?: string
): Promise<boolean> {
  try {
    const response = await fetch(annotationId, {
      method: "DELETE",
      headers: token ? { Authorization: token } : {}
    });
    // 204 No Content is the success response for DELETE
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}
