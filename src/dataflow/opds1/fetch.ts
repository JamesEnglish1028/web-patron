import OPDSParser, { OPDSFeed, OPDSEntry } from "opds-feed-parser";
import ApplicationError, { ServerError } from "errors";
import {
  AnyBook,
  CollectionData,
  FulfillableBook,
  FulfillmentLink,
  MediaSupportConfig,
  MediaSupportLevel,
  OPDS1
} from "interfaces";
import { entryToBook, feedToCollection } from "dataflow/opds1/parse";
import fetchWithHeaders from "dataflow/fetch";
import parseSearchData from "dataflow/opds1/parseSearchData";
import { toBrowserFetchUrl } from "utils/localCmProxy";
import { getProxiedUrl } from "utils/proxyUrl";

let _mediaSupport: MediaSupportConfig = {};

/** Sets the media-support config. Called once at app startup from _app.tsx. */
export function setFetchMediaSupportConfig(config: MediaSupportConfig): void {
  _mediaSupport = config;
}

const parser = new OPDSParser();
/**
 * Function that will fetch opds and parse it into either
 * a Feed or an Entry
 */
export async function fetchOPDS(
  url: string,
  token?: string,
  additionalHeaders?: { [key: string]: string }
): Promise<OPDSEntry | OPDSFeed> {
  const response = await fetchWithHeaders(url, token, additionalHeaders);
  // If the status code is not in the range 200-299,
  // we still try to parse and throw it.
  if (!response.ok) {
    const details = await parseErrorResponse(response);
    throw new ServerError(url, response.status, details);
  }

  const text = await response.text();

  try {
    // parse the text into an opds feed or entry
    return await parser.parse(text);
  } catch (e) {
    throw new ApplicationError(
      {
        title: "OPDS Error",
        detail: "Could not parse fetch response into an OPDS Feed or Entry"
      },
      e
    );
  }
}

/**
 * A function specifically for fetching a feed
 */
export async function fetchFeed(
  url: string,
  token?: string
): Promise<OPDSFeed> {
  const result = await fetchOPDS(url, token, {
    // Explicitly accept all languages when fetching feeds. Otherwise, the browser will send an
    // Accept-Language header for its current language, which causes books in other languages to
    // be filtered out of search results.
    "Accept-Language": "*"
  });
  if (result instanceof OPDSFeed) {
    return result;
  }
  throw new ApplicationError({
    title: "OPDS Error",
    detail: `Network response was expected to be an OPDS 1.x Feed, but was not parseable as such. Url: ${url}`
  });
}

/**
 * A function specifically for fetching an entry
 */
export async function fetchEntry(
  url: string,
  token?: string
): Promise<OPDSEntry> {
  const result = await fetchOPDS(url, token);
  if (result instanceof OPDSEntry) {
    return result;
  }
  throw new ApplicationError({
    title: "OPDS Error",
    detail: `Network response was expected to be an OPDS 1.x Entry, but was not parseable as such. Url: ${url}`
  });
}

/**
 * A function to fetch a feed and convert it to a collection
 */
export async function fetchCollection(
  url: string,
  token?: string
): Promise<CollectionData> {
  const feed = await fetchFeed(url, token);
  const collection = feedToCollection(feed, url);
  return collection;
}

/**
 * A function to fetch an entry and convert it to a book
 */
export async function fetchBook(
  url: string,
  catalogUrl: string,
  token?: string
): Promise<AnyBook> {
  const response = await fetchWithHeaders(url, token);
  if (!response.ok) {
    const details = await parseErrorResponse(response);
    throw new ServerError(url, response.status, details);
  }

  const ct = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (ct.includes("application/opds+json") || ct.includes("application/json")) {
    const json = await response.json();
    const book = opds2EntryToBook(json, url);
    if (book) return book;
    // Fall through to XML parse if the JSON didn't look like an OPDS 2 entry
    throw new ApplicationError({
      title: "OPDS Error",
      detail: `OPDS 2 borrow response could not be parsed into a book. Url: ${url}`
    });
  }

  const text = await response.text();
  try {
    const parsed = await parser.parse(text);
    if (parsed instanceof OPDSEntry) {
      return entryToBook(parsed, catalogUrl);
    }
  } catch {
    // fall through to error below
  }
  throw new ApplicationError({
    title: "OPDS Error",
    detail: `Network response was expected to be an OPDS 1.x Entry, but was not parseable as such. Url: ${url}`
  });
}

/**
 * Minimal media-support level check that mirrors getAppSupportLevel in
 * utils/fulfill without importing it (which would create a circular dep:
 * fetch → fulfill → fetch).
 */
function getMediaSupportLevel(
  contentType: string,
  indirectionType?: string
): MediaSupportLevel {
  const defaultLevel: MediaSupportLevel =
    _mediaSupport?.default ?? "unsupported";
  if (indirectionType) {
    return (
      (_mediaSupport[indirectionType]?.[contentType] as MediaSupportLevel) ??
      defaultLevel
    );
  }
  return (_mediaSupport[contentType] as MediaSupportLevel) ?? defaultLevel;
}

/**
 * Parse an OPDS 2 / Readium Web Pub Manifest JSON entry returned by a borrow
 * endpoint into a FulfillableBook. Returns null if the response does not look
 * like an OPDS 2 entry.
 */
function opds2EntryToBook(
  json: Record<string, unknown>,
  feedUrl: string
): FulfillableBook | null {
  const metadata = json.metadata as Record<string, unknown> | undefined;
  const links = json.links as Array<Record<string, unknown>> | undefined;
  const images = json.images as Array<Record<string, unknown>> | undefined;

  if (!metadata || !links) return null;

  const title = (metadata.title as string) ?? "";
  const id = (metadata.identifier as string) ?? feedUrl;
  const authorField = metadata.author as
    | { name?: string }
    | string
    | Array<{ name?: string } | string>
    | undefined;
  const authors: string[] = [];
  if (Array.isArray(authorField)) {
    for (const a of authorField) {
      const name = typeof a === "string" ? a : a?.name;
      if (name) authors.push(name);
    }
  } else if (typeof authorField === "string") {
    authors.push(authorField);
  } else if (authorField?.name) {
    authors.push(authorField.name);
  }

  const imageUrl = images?.find(
    img => img.rel === "http://opds-spec.org/image" || img.rel === "cover"
  )?.href as string | undefined;

  const revokeUrl =
    (links.find(l => l.rel === "http://librarysimplified.org/terms/rel/revoke")
      ?.href as string | null) ?? null;

  const availabilityRaw = links.find(
    l => l.rel === "http://opds-spec.org/acquisition"
  )?.properties as Record<string, unknown> | undefined;
  const availability = availabilityRaw?.availability as
    | { state?: string; since?: string; until?: string }
    | undefined;

  const fulfillmentLinks: FulfillmentLink[] = [];
  for (const link of links) {
    const rel = link.rel as string | undefined;
    if (rel !== "http://opds-spec.org/acquisition") continue;

    const href = link.href as string | undefined;
    if (!href) continue;

    const properties = link.properties as Record<string, unknown> | undefined;
    const indirectAcquisitions = properties?.indirectAcquisition as
      | Array<{ type: string }>
      | undefined;

    const outerType = link.type as string | undefined;
    if (!outerType) continue;

    if (indirectAcquisitions && indirectAcquisitions.length > 0) {
      // Bearer-token or OPDS-entry indirection: outer type is the indirection
      // type; inner type is the final content type.
      const innerType = indirectAcquisitions[0].type as OPDS1.AnyBookMediaType;
      const indirectionType = outerType as OPDS1.IndirectAcquisitionType;
      const supportLevel = getMediaSupportLevel(innerType, indirectionType);
      if (supportLevel !== "unsupported") {
        fulfillmentLinks.push({
          url: new URL(href, feedUrl).toString(),
          contentType: innerType,
          indirectionType,
          supportLevel,
          rel,
          templated: Boolean(link.templated)
        });
      }
    } else {
      // Direct acquisition — outer type is the content type.
      const contentType = outerType as OPDS1.AnyBookMediaType;
      const supportLevel = getMediaSupportLevel(contentType, undefined);
      if (supportLevel !== "unsupported") {
        fulfillmentLinks.push({
          url: new URL(href, feedUrl).toString(),
          contentType,
          supportLevel,
          rel,
          templated: Boolean(link.templated)
        });
      }
    }
  }

  // If no supported links were found treat the book as unsupported rather
  // than returning null, which would cause a confusing XML parse error.
  const book: FulfillableBook = {
    id,
    title,
    authors,
    imageUrl,
    url: feedUrl,
    relatedUrl: null,
    trackOpenBookUrl: null,
    status: "fulfillable",
    revokeUrl,
    fulfillmentLinks,
    availability: availability
      ? {
          status: availability.state === "ready" ? "available" : "unavailable",
          since: availability.since,
          until: availability.until
        }
      : undefined
  };

  return book;
}

/**
 * Fetch a bearer token to use to download a book
 */
export async function fetchBearerToken(
  url: string,
  token?: string,
  additionalHeaders?: { [key: string]: string }
): Promise<OPDS1.BearerTokenDocument> {
  const parseJson = async (response: Response) => {
    try {
      return await response.json();
    } catch {
      return {};
    }
  };

  const getAttempt = await fetchWithHeaders(
    url,
    token,
    additionalHeaders,
    "GET"
  );
  const getPayload = await parseJson(getAttempt);

  if (getAttempt.ok) {
    return getPayload;
  }

  const payloadText = JSON.stringify(getPayload).toLowerCase();
  const shouldRetryWithPost =
    getAttempt.status === 405 ||
    payloadText.includes("cannot-fulfill-loan") ||
    payloadText.includes("method not allowed");

  if (shouldRetryWithPost) {
    const postHeaders: Record<string, string> = {
      ...(additionalHeaders || {})
    };

    // Determine the correct proxy route for the POST retry.
    // toBrowserFetchUrl rewrites localhost:6500 → /api/cm (passes Authorization
    // directly). For all other browser-side URLs, getProxiedUrl → /api/fulfill
    // (expects X-Reader-Authorization, which it renames to Authorization upstream).
    // /api/fulfill has SSRF protection that blocks localhost, so using getProxiedUrl
    // for local CM URLs would result in a 400 "URL target is not allowed" error.
    let postUrl: string;
    let isLocalCm = false;
    if (typeof window === "undefined") {
      postUrl = url;
    } else {
      const proxied = toBrowserFetchUrl(url);
      isLocalCm = proxied !== url; // toBrowserFetchUrl rewrote it → local CM path
      postUrl = isLocalCm ? proxied : getProxiedUrl(url);
    }

    if (token) {
      if (typeof window === "undefined" || isLocalCm) {
        // Server-side or local CM: set Authorization directly.
        postHeaders.Authorization = token;
      } else {
        // Browser → /api/fulfill proxy: proxy renames X-Reader-Authorization
        // to Authorization before forwarding to the upstream server.
        postHeaders["X-Reader-Authorization"] = token;
      }
    }

    const postAttempt = await fetch(postUrl, {
      method: "POST",
      headers: postHeaders
    });
    const postPayload = await parseJson(postAttempt);

    if (!postAttempt.ok) {
      throw new ServerError(url, postAttempt.status, postPayload);
    }

    return postPayload;
  }

  throw new ServerError(url, getAttempt.status, getPayload);
}

/**
 * Utilities
 */

export function stripUndefined(json: any) {
  return JSON.parse(JSON.stringify(json));
}

/**
 * Fetches the search description for the catalog root, used for the global
 * search bar
 */
export async function fetchSearchData(url: string) {
  const response = await fetch(toBrowserFetchUrl(url));

  if (!response.ok) {
    const details = await parseErrorResponse(response);
    throw new ServerError(url, response.status, details);
  }

  const text = await response.text();
  const data = await parseSearchData(text, url);
  return data;
}

async function parseErrorResponse(
  response: Response
): Promise<OPDS1.ProblemDocument> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (
    contentType.includes("application/json") ||
    contentType.includes("+json")
  ) {
    try {
      return await response.json();
    } catch {
      // fall through to text parser
    }
  }

  const bodyText = await response.text();
  const snippet = bodyText.trim().slice(0, 300);

  return {
    title: "Server Error",
    detail: snippet
      ? `Unexpected non-JSON error response body: ${snippet}`
      : "Unexpected empty error response body.",
    status: response.status
  };
}
