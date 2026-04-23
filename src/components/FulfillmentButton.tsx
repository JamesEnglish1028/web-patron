import * as React from "react";
import {
  AnyFullfillment,
  DownloadFulfillment,
  ReadExternalFulfillment,
  ReadInternalFulfillment
} from "utils/fulfill";
import { AuthCredentials, FulfillableBook, OPDS1 } from "interfaces";
import track from "analytics/track";
import SvgDownload from "icons/Download";
import SvgExternalLink from "icons/ExternalOpen";
import SvgBook from "icons/Book";
import { useRouter } from "next/router";
import { Text } from "components/Text";
import Button from "components/Button";
import useLibraryContext from "components/context/LibraryContext";
import useUser from "components/context/UserContext";
import downloadFile from "dataflow/download";
import useError from "hooks/useError";
import useLinkUtils from "hooks/useLinkUtils";
import { navigateToUrl, navigateWindowToUrl } from "utils/navigation";
import { storeReaderAuth } from "utils/readerAuth";
import { getProxiedUrl } from "utils/proxyUrl";
import { toBrowserFetchUrl } from "utils/localCmProxy";
import { isPalaceManagerLikeUrl } from "utils/fulfill";
import Stack from "./Stack";

/**
 * Palace CM fulfill endpoints need the patron's Basic auth credentials
 * (not the app-session Bearer token) to identify the patron and proxy
 * the bearer-token request to the content vendor.
 */
function getBasicToken(
  credentials: AuthCredentials | undefined
): string | undefined {
  if (
    credentials?.token &&
    typeof credentials.token === "object" &&
    credentials.token.basicToken
  ) {
    return credentials.token.basicToken;
  }
  // For pure Basic Auth, the token itself is already "Basic xxx"
  if (
    typeof credentials?.token === "string" &&
    credentials.token.startsWith("Basic ")
  ) {
    return credentials.token;
  }
  return undefined;
}

const sleep = (ms: number) =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const isLocalCmUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "http:" &&
      ["localhost:6500", "127.0.0.1:6500", "[::1]:6500"].includes(parsed.host)
    );
  } catch {
    return false;
  }
};

const isPalaceFulfillUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.pathname.includes("/fulfill/") && isPalaceManagerLikeUrl(url);
  } catch {
    return false;
  }
};

const buildPalaceRequest = (url: string, authToken?: string) => {
  const localCm = isLocalCmUrl(url);
  const headers: Record<string, string> = {};
  if (authToken) {
    if (localCm) {
      headers.Authorization = authToken;
    } else {
      headers["X-Reader-Authorization"] = authToken;
    }
  }

  return {
    url: localCm ? toBrowserFetchUrl(url) : getProxiedUrl(url),
    headers: Object.keys(headers).length ? headers : undefined
  };
};

async function waitForAudiobookFulfillmentReady(
  fulfillUrl: string,
  authToken?: string
): Promise<boolean> {
  if (!isPalaceFulfillUrl(fulfillUrl)) return true;

  const request = buildPalaceRequest(fulfillUrl, authToken);
  const headHeaders = {
    ...request.headers,
    Accept:
      "application/vnd.librarysimplified.bearer-token+json, application/audiobook+json;q=0.9, */*;q=0.1"
  };

  for (const waitMs of [0, 500, 1200, 2500]) {
    if (waitMs > 0) await sleep(waitMs);
    const response = await fetch(request.url, {
      method: "HEAD",
      headers: headHeaders
    });

    if (response.ok) return true;

    const status = response.status;
    if (status === 401 || status === 403 || status === 404 || status === 405) {
      // Don't block opening when HEAD isn't authorized/supported.
      return true;
    }
    if (status !== 500 && status !== 502 && status !== 503) {
      // Let the reader attempt fulfillment for any non-transient status.
      return true;
    }
  }

  // Still syncing after retries; proceed and let AudioReader retry in context.
  return false;
}

async function findLatestAudiobookFulfillUrlFromLoans(
  currentFulfillUrl: string,
  authToken?: string,
  titleHint?: string
): Promise<string | null> {
  if (!isPalaceFulfillUrl(currentFulfillUrl)) return null;

  let loansUrl: string;
  try {
    const parsed = new URL(currentFulfillUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const library = parts[0];
    if (!library) return null;
    loansUrl = `${parsed.origin}/${library}/loans/`;
  } catch {
    return null;
  }

  const requestHeaders: Record<string, string> = {
    Accept:
      "application/atom+xml;profile=opds-catalog, application/xml, text/xml, */*"
  };
  const request = buildPalaceRequest(loansUrl, authToken);
  if (request.headers) {
    Object.assign(requestHeaders, request.headers);
  }

  const response = await fetch(request.url, {
    method: "GET",
    headers: requestHeaders
  });
  if (!response.ok) return null;

  const xmlText = await response.text();
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const entries = Array.from(doc.getElementsByTagName("entry"));

  const isAudiobookType = (value: string) => {
    const lower = value.toLowerCase();
    return (
      lower.includes("application/audiobook+json") ||
      lower.includes("application/audiobook+lcp") ||
      lower.includes("feedbooks.com/audiobooks/access-restriction")
    );
  };

  for (const entry of entries) {
    const entryTitle =
      entry.getElementsByTagName("title")[0]?.textContent?.trim() || "";
    if (titleHint && entryTitle && entryTitle !== titleHint) continue;

    const links = Array.from(entry.getElementsByTagName("link"));
    for (const link of links) {
      const rel = (link.getAttribute("rel") || "").toLowerCase();
      const type = link.getAttribute("type") || "";
      const href = link.getAttribute("href") || "";
      if (!href) continue;
      if (rel !== "http://opds-spec.org/acquisition") continue;
      if (!isAudiobookType(type)) continue;

      const resolvedHref = new URL(href, loansUrl).toString();
      if (resolvedHref !== currentFulfillUrl) return resolvedHref;
    }
  }

  return null;
}

const FulfillmentButton: React.FC<{
  details: AnyFullfillment;
  book: FulfillableBook;
  isPrimaryAction: boolean;
}> = ({ details, book, isPrimaryAction }) => {
  switch (details.type) {
    case "download":
      return (
        <DownloadButton
          details={details}
          title={book.title}
          isPrimaryAction={isPrimaryAction}
        />
      );
    case "read-online-internal":
      return (
        <ReadOnlineInternal
          details={details}
          isPrimaryAction={isPrimaryAction}
          trackOpenBookUrl={book.trackOpenBookUrl}
          title={book.title}
        />
      );
    case "read-online-external":
      return (
        <ReadOnlineExternal
          details={details}
          isPrimaryAction={isPrimaryAction}
          trackOpenBookUrl={book.trackOpenBookUrl}
        />
      );
    case "unsupported":
      return null;
  }
};

export default FulfillmentButton;

function getFormatLabel(contentType?: string): string {
  switch (contentType) {
    case OPDS1.EpubMediaType:
    case OPDS1.KepubMediaType:
      return "EPUB";
    case OPDS1.PdfMediaType:
      return "PDF";
    default:
      return "";
  }
}

function getFormatIcon(contentType?: string) {
  switch (contentType) {
    case OPDS1.EpubMediaType:
    case OPDS1.KepubMediaType:
    case OPDS1.PdfMediaType:
      return SvgBook;
    default:
      return undefined;
  }
}

function getButtonStyles(isPrimaryAction: boolean) {
  return isPrimaryAction
    ? ({
        variant: "filled",
        color: "brand.primary"
      } as const)
    : ({
        variant: "ghost",
        color: "ui.gray.extraDark"
      } as const);
}

const ReadOnlineExternal: React.FC<{
  details: ReadExternalFulfillment;
  isPrimaryAction: boolean;
  trackOpenBookUrl: string | null;
}> = ({ details, isPrimaryAction, trackOpenBookUrl }) => {
  const { catalogUrl } = useLibraryContext();
  const { token, patronId, credentials } = useUser();
  const basicToken = getBasicToken(credentials);
  const [loading, setLoading] = React.useState(false);
  const { error, handleError, clearError } = useError();

  async function open() {
    setLoading(true);
    clearError();
    try {
      // Open a blank tab synchronously before any async work so the browser
      // treats it as user-initiated, bypassing popup blockers.
      const newTab = window.open("about:blank", "_blank");
      // Create a loading page immediately so the user never sees about:blank.
      if (newTab) {
        newTab.document.title = "Loading\u2026";
        const p = newTab.document.createElement("p");
        p.textContent = "Loading\u2026";
        p.style.cssText =
          "font-family:sans-serif;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)";
        newTab.document.body.appendChild(p);
      }

      // the url may be behind indirection, so we fetch it with the
      // provided function
      const { url: externalReaderUrl } = await details.getLocation(
        catalogUrl,
        token,
        { patronId, basicToken }
      );

      // we are about to open the book, so send a track event
      track.openBook(trackOpenBookUrl);
      setLoading(false);

      // newTab can still be null if the user has explicitly blocked popups for
      // this site. Fall back to navigating the current tab in that case.
      if (newTab) {
        navigateWindowToUrl(newTab, externalReaderUrl);
      } else {
        navigateToUrl(externalReaderUrl);
      }
    } catch (e) {
      setLoading(false);
      handleError(e);
    }
  }

  const formatLabel = getFormatLabel(details?.contentType);
  const formatIcon = getFormatIcon(details?.contentType);
  const buttonText = formatLabel
    ? `Read ${formatLabel}`
    : (details?.buttonLabel ?? "Read");

  return (
    <Stack sx={{ flexWrap: "wrap" }}>
      <Button
        {...getButtonStyles(isPrimaryAction)}
        iconLeft={formatIcon || SvgExternalLink}
        onClick={open}
        loading={loading}
        loadingText="Opening..."
      >
        {buttonText}
      </Button>
      {error && <Text sx={{ color: "ui.error" }}>{error}</Text>}
    </Stack>
  );
};

const ReadOnlineInternal: React.FC<{
  details: ReadInternalFulfillment;
  trackOpenBookUrl: string | null;
  title?: string;
  isPrimaryAction: boolean;
}> = ({ details, isPrimaryAction, trackOpenBookUrl, title }) => {
  const router = useRouter();
  const { buildReaderLink } = useLinkUtils();
  const { catalogUrl } = useLibraryContext();
  const { token, patronId, credentials } = useUser();
  const basicToken = getBasicToken(credentials);
  const [loading, setLoading] = React.useState(false);
  const { error, handleError, clearError } = useError();

  async function open() {
    setLoading(true);
    clearError();
    try {
      let resolved = details.getLocation
        ? await details.getLocation(catalogUrl, token, { patronId, basicToken })
        : { url: details.url, token: undefined };
      if (
        [
          OPDS1.AudiobookMediaType,
          OPDS1.AccessRestrictionAudiobookMediaType,
          OPDS1.LcpAudioBookMediaType
        ].includes(details.contentType as OPDS1.AnyBookMediaType)
      ) {
        const ready = await waitForAudiobookFulfillmentReady(
          resolved.url,
          resolved.token
        );
        if (!ready) {
          const refreshedFulfillUrl =
            await findLatestAudiobookFulfillUrlFromLoans(
              resolved.url,
              resolved.token,
              title
            );
          if (refreshedFulfillUrl) {
            resolved = { ...resolved, url: refreshedFulfillUrl };
            await waitForAudiobookFulfillmentReady(
              resolved.url,
              resolved.token
            );
          }
        }
      }
      const authKey = resolved.token
        ? storeReaderAuth({ url: resolved.url, token: resolved.token })
        : null;
      const internalLink = buildReaderLink("internal", resolved.url);
      const query = [
        details.contentType
          ? `ct=${encodeURIComponent(details.contentType)}`
          : null,
        authKey ? `authKey=${encodeURIComponent(authKey)}` : null
      ]
        .filter(Boolean)
        .join("&");
      track.openBook(trackOpenBookUrl);
      setLoading(false);
      router.push(
        query ? `${internalLink}?${query}` : internalLink,
        undefined,
        { shallow: true }
      );
    } catch (e) {
      setLoading(false);
      handleError(e);
    }
  }

  const formatLabel = getFormatLabel(details?.contentType);
  const formatIcon = getFormatIcon(details?.contentType);
  const buttonText = formatLabel
    ? `Read ${formatLabel}`
    : (details?.buttonLabel ?? "Read");

  return (
    <Stack sx={{ flexWrap: "wrap" }}>
      <Button
        {...getButtonStyles(isPrimaryAction)}
        onClick={open}
        loading={loading}
        loadingText="Opening..."
        iconLeft={formatIcon}
      >
        {buttonText}
      </Button>
      {error && <Text sx={{ color: "ui.error" }}>{error}</Text>}
    </Stack>
  );
};

const DownloadButton: React.FC<{
  details: DownloadFulfillment;
  title: string;
  isPrimaryAction: boolean;
}> = ({ details, title, isPrimaryAction }) => {
  const { buttonLabel } = details;
  const [loading, setLoading] = React.useState(false);
  const { error, handleError, clearError } = useError();
  const { catalogUrl } = useLibraryContext();
  const { token, patronId, credentials } = useUser();
  const basicToken = getBasicToken(credentials);

  async function download() {
    setLoading(true);
    clearError();
    try {
      const { url: downloadUrl, token: downloadToken } =
        await details.getLocation(catalogUrl, token, { patronId, basicToken });

      await downloadFile(
        downloadUrl,
        title,
        details.contentType,
        downloadToken
      );
    } catch (e) {
      setLoading(false);
      handleError(e);
    }
    setLoading(false);
  }

  return (
    <>
      <Button
        onClick={download}
        {...getButtonStyles(isPrimaryAction)}
        iconLeft={SvgDownload}
        loading={loading}
        loadingText="Downloading..."
      >
        {buttonLabel}
      </Button>
      {error && <Text sx={{ color: "ui.error" }}>{error}</Text>}
    </>
  );
};
