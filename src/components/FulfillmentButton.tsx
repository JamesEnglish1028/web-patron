import * as React from "react";
import {
  AnyFullfillment,
  DownloadFulfillment,
  ReadExternalFulfillment,
  ReadInternalFulfillment
} from "utils/fulfill";
import { FulfillableBook, OPDS1 } from "interfaces";
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
import Stack from "./Stack";

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
  const { token } = useUser();
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
        token
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
  isPrimaryAction: boolean;
}> = ({ details, isPrimaryAction, trackOpenBookUrl }) => {
  const router = useRouter();
  const { buildReaderLink } = useLinkUtils();
  const { catalogUrl } = useLibraryContext();
  const { token } = useUser();
  const [loading, setLoading] = React.useState(false);
  const { error, handleError, clearError } = useError();

  async function open() {
    setLoading(true);
    clearError();
    try {
      const resolved = details.getLocation
        ? await details.getLocation(catalogUrl, token)
        : { url: details.url, token: undefined };
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
  const { token } = useUser();

  async function download() {
    setLoading(true);
    clearError();
    try {
      const { url: downloadUrl, token: downloadToken } =
        await details.getLocation(catalogUrl, token);

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
