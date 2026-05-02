/* eslint-disable react-hooks/exhaustive-deps */
// react-hooks/exhaustive-deps is suppressed globally because the main EPUB
// load effect intentionally omits display-preference deps (fontSize, theme,
// fontFamily, pageView) to avoid reloading the whole book when the reader
// changes a display setting.  Those preferences are synced to the live
// rendition by their own dedicated effects below.
import * as React from "react";
import { Box, type ThemeUIStyleObject } from "theme-ui";
import { Text } from "components/Text";
import Button from "components/Button";
import ChevronLeft from "icons/ChevronLeft";
import ChevronRight from "icons/ChevronRight";
import Info from "icons/Info";
import Trash from "icons/Trash";
import Stack from "components/Stack";
import ReaderControls from "../ReaderControls";
import ReaderUtilityControls from "../ReaderUtilityControls";
import AnnotationPanel from "../AnnotationPanel";
import ReaderNavigationPanel from "../ReaderNavigationPanel";
import { useReaderInfo } from "../ReaderWrapper";
import { getProxiedUrl } from "utils/proxyUrl";
import { toBrowserFetchUrl } from "utils/localCmProxy";
import { performBookSearch } from "utils/readerSearch";
import {
  loadBookmarks,
  saveBookmarks,
  loadCitations,
  saveCitations
} from "utils/readerAnnotations";
import { downloadAnnotationAsRis } from "utils/ris";
import { useAnnotationSync } from "hooks/useAnnotationSync";
import { useEpubAnnotations } from "hooks/useEpubAnnotations";
import {
  type EpubReaderProps,
  type EpubSpineItem,
  type EpubTocItem,
  type EpubSearchResult,
  type EpubRelocation,
  type EpubContentsLike,
  type EpubRenditionLike,
  type EpubBookLike,
  type InputBoxProps
} from "./EpubReader.types";

const InputBox = Box as unknown as React.FC<InputBoxProps>;

// --- EpubReader ---

const EpubReader: React.FC<EpubReaderProps> = ({
  url,
  authToken,
  title,
  bookUrl,
  setLoading
}) => {
  const bookId = bookUrl ?? url;
  const annotationSync = useAnnotationSync({
    bookKey: url,
    bookId,
    mediaType: "epub"
  });
  // Refs hold mutable values that must survive re-renders without causing them.
  // bookRef and renditionRef are the live epubjs objects; tocRef is a
  // synchronous mirror of tocItems state used inside async callbacks.
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const bookRef = React.useRef<EpubBookLike | null>(null);
  const renditionRef = React.useRef<EpubRenditionLike | null>(null);
  const tocRef = React.useRef<EpubTocItem[]>([]);

  const [error, setError] = React.useState<string | null>(null);
  const [progressLabel, setProgressLabel] = React.useState("");
  const [metadataTitle, setMetadataTitle] = React.useState("");
  const [metadataAuthor, setMetadataAuthor] = React.useState("");
  const [metadataPublisher, setMetadataPublisher] = React.useState("");
  const [fontSize, setFontSize] = React.useState(100);
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const [fontFamily, setFontFamily] = React.useState("publisher");
  const [pageView, setPageView] = React.useState<"single" | "spread">("single");
  const [tocItems, setTocItems] = React.useState<EpubTocItem[]>([]);
  const [showToc, setShowToc] = React.useState(false);
  const [tocTab, setTocTab] = React.useState<
    "toc" | "bookmarks" | "annotations"
  >("toc");
  const [showSearch, setShowSearch] = React.useState(false);
  const [showDisplay, setShowDisplay] = React.useState(false);
  const [currentChapter, setCurrentChapter] = React.useState("");
  const [currentCfi, setCurrentCfi] = React.useState("");
  const [currentHref, setCurrentHref] = React.useState("");
  const [currentPageLabel, setCurrentPageLabel] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");

  // Annotation management via hook
  const {
    bookmarks,
    setBookmarks,
    setCitations,
    citationDraft,
    setCitationDraft,
    editingCitationId,
    setEditingCitationId,
    editingCitationDraft,
    setEditingCitationDraft,
    pendingCitationText,
    setPendingCitationText,
    sortedBookmarks,
    sortedCitations,
    bookmarkActive,
    addBookmark,
    removeBookmark,
    addCitation,
    removeCitation,
    beginCitationEdit,
    cancelCitationEdit,
    saveCitationEdit,
    copyCitation
  } = useEpubAnnotations(
    url,
    currentCfi,
    currentChapter,
    currentPageLabel,
    bookRef,
    metadataTitle,
    title,
    annotationSync
  );
  const [searchResults, setSearchResults] = React.useState<EpubSearchResult[]>(
    []
  );
  const [isSearching, setIsSearching] = React.useState(false);
  const [selectionPopup, setSelectionPopup] = React.useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const searchInProgressRef = React.useRef(false);
  const displayPanelRef = React.useRef<HTMLDivElement | null>(null);
  const displayButtonRef = React.useRef<HTMLButtonElement>(
    null as unknown as HTMLButtonElement
  );
  const tocButtonRef = React.useRef<HTMLButtonElement>(
    null as unknown as HTMLButtonElement
  );
  const searchButtonRef = React.useRef<HTMLButtonElement>(
    null as unknown as HTMLButtonElement
  );

  const readerInfo = useReaderInfo();

  // Wrapped in useCallback with an empty dep array because it is passed into
  // the load effect's dep array — a stable reference prevents that effect
  // from re-running every render.
  const applyTheme = React.useCallback((next: "light" | "dark") => {
    const rendition = renditionRef.current;
    rendition?.themes?.select?.(next);
    const bg = next === "dark" ? "#0f172a" : "#ffffff";
    const fg = next === "dark" ? "#e2e8f0" : "#0f172a";

    try {
      rendition?.views?.().forEach((view: { document?: Document }) => {
        if (!view?.document) return;
        view.document.documentElement.style.background = bg;
        view.document.body.style.background = bg;
        view.document.body.style.color = fg;
      });
    } catch {
      // ignore view style errors
    }

    try {
      const root = document.documentElement;
      root.style.setProperty(
        "--reader-chrome-bg",
        next === "dark" ? "#0b1220" : "#ffffff"
      );
      root.style.setProperty(
        "--reader-chrome-text",
        next === "dark" ? "#e2e8f0" : "#0f172a"
      );
      root.style.setProperty(
        "--reader-chrome-border",
        next === "dark" ? "#1f2937" : "#e2e8f0"
      );
    } catch {
      // ignore css variable errors
    }
  }, []);

  React.useEffect(() => {
    tocRef.current = tocItems;
  }, [tocItems]);

  // --- Load EPUB ---
  // The `active` flag prevents state updates after the component unmounts or
  // before a new load cycle begins.  The cleanup function flips it to false,
  // turning any in-flight awaits into no-ops.
  React.useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const proxied = toBrowserFetchUrl(url);
        const isLocalCm = proxied !== url;
        const fetchUrl = isLocalCm ? proxied : getProxiedUrl(url);
        const fetchHeaders: Record<string, string> = {};
        if (authToken) {
          fetchHeaders[isLocalCm ? "Authorization" : "X-Reader-Authorization"] =
            authToken;
        }
        const response = await fetch(fetchUrl, {
          headers: Object.keys(fetchHeaders).length ? fetchHeaders : undefined
        });
        if (!response.ok)
          throw new Error(`Failed to load EPUB (${response.status})`);

        const contentType = response.headers.get("content-type") || "";
        if (
          !contentType.includes("application/epub+zip") &&
          !contentType.includes("application/octet-stream")
        ) {
          throw new Error("Unexpected response type for EPUB.");
        }

        const buffer = await response.arrayBuffer();
        const { default: ePub } = await import("epubjs");
        if (!active || !containerRef.current) return;

        const book = ePub(buffer) as unknown as EpubBookLike;
        bookRef.current = book;

        if (!book.renderTo) {
          throw new Error("Failed to initialize EPUB renderer.");
        }

        const rendition = book.renderTo(containerRef.current, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: pageView === "spread" ? "auto" : "none"
        });
        renditionRef.current = rendition;

        rendition.themes?.register?.("light", {
          body: { background: "#ffffff", color: "#0f172a" },
          html: { background: "#ffffff", color: "#0f172a" }
        });
        rendition.themes?.register?.("dark", {
          body: { background: "#0f172a", color: "#e2e8f0" },
          html: { background: "#0f172a", color: "#e2e8f0" }
        });

        rendition.themes?.fontSize?.(`${fontSize}%`);
        rendition.themes?.font?.(resolveFontFamily(fontFamily));
        rendition.spread?.(pageView === "spread" ? "auto" : "none");
        applyTheme(theme);

        rendition.on?.("relocated", (location: EpubRelocation) => {
          const cfi = location?.start?.cfi;
          const displayed = location?.start?.displayed;
          const href = location?.start?.href;

          if (cfi) {
            setCurrentCfi(cfi);
            try {
              localStorage.setItem(`reader:lastLocation:${url}`, cfi);
            } catch {
              // ignore storage failures
            }
            // Sync last position to annotation service (fire-and-forget)
            annotationSync.syncLastPosition({ cfi });
          }

          if (href) {
            setCurrentHref(href);
            const label = findTocLabel(
              bookRef.current?.navigation?.toc || tocRef.current,
              href
            );
            if (label) setCurrentChapter(label);
          }

          try {
            const locations = bookRef.current?.locations;
            if (locations?.locationFromCfi && locations?.length && cfi) {
              const loc = locations.locationFromCfi(cfi);
              const total = locations.length();
              if (
                typeof loc === "number" &&
                Number.isFinite(loc) &&
                typeof total === "number" &&
                Number.isFinite(total) &&
                total > 0
              ) {
                const page = Math.max(1, Math.round(loc) + 1);
                setCurrentPageLabel(`Page ${page}`);
                setProgressLabel(`Page ${page} of ${Math.round(total)}`);
                return;
              }
            }
          } catch {
            // ignore location conversion errors
          }

          if (displayed?.page && displayed?.total) {
            setCurrentPageLabel(`Page ${displayed.page}`);
            setProgressLabel(`Page ${displayed.page} of ${displayed.total}`);
          }
        });

        // Suppress EPUB 3 print page-break markers (epub:type="pagebreak").
        // These are aria-hidden <span>/<a> elements that mark print page
        // boundaries; without CSS they render as visible inline links.
        // hooks.content fires for every page render and receives the view;
        // contents is at view.contents — addStylesheetCss() injects CSS.
        const PAGE_BREAK_CSS =
          `[epub\\:type~="pagebreak"],[role="doc-pagebreak"],` +
          `span.pagebreak,a.pagebreak,span.page-break,a.page-break,` +
          `[aria-hidden="true"][class~="page"],[aria-hidden="true"][id^="pg"]` +
          `{display:none!important}`;
        rendition.hooks?.content?.register?.((contents: EpubContentsLike) => {
          try {
            contents.addStylesheetCss?.(
              PAGE_BREAK_CSS,
              "__epub-hide-pagebreaks__"
            );
          } catch {
            // ignore injection errors
          }
        });

        // epubjs fires "selected" with the contents object of the iframe that
        // renders the EPUB page.  We offset the in-iframe selection rect by the
        // iframe's bounding rect so the popup appears in host-document space.
        rendition.on?.(
          "selected",
          (_cfiRange: string, contents: EpubContentsLike) => {
            if (!active) return;
            try {
              const selection = contents?.window?.getSelection?.();
              if (!selection || selection.isCollapsed) return;
              const text = selection.toString().trim();
              if (!text) return;
              const iframeEl = containerRef.current?.querySelector("iframe");
              const iframeRect = iframeEl?.getBoundingClientRect() ?? null;
              const range = selection.getRangeAt(0);
              const selRect = range.getBoundingClientRect();
              const x =
                (iframeRect?.left ?? 0) + selRect.left + selRect.width / 2;
              const y = (iframeRect?.top ?? 0) + selRect.top;
              setSelectionPopup({ text, x, y });
            } catch {
              // ignore selection positioning errors
            }
          }
        );

        const metadata = (await book.loaded?.metadata) || {};
        const titleFromBook = normalize(
          metadata?.title || metadata?.["dc:title"] || ""
        );
        const authorFromBook = normalize(
          metadata?.creator || metadata?.["dc:creator"]
        );
        const publisherFromBook = normalize(
          metadata?.publisher || metadata?.["dc:publisher"]
        );
        if (titleFromBook) setMetadataTitle(titleFromBook);
        if (authorFromBook) setMetadataAuthor(authorFromBook);
        if (publisherFromBook) setMetadataPublisher(publisherFromBook);
        let coverUrl = "";
        try {
          const cover = await book.coverUrl?.();
          coverUrl = normalize(typeof cover === "string" ? cover : "");
        } catch {
          // ignore cover extraction failures
        }
        if (readerInfo?.setBookInfo) {
          readerInfo.setBookInfo({
            title: titleFromBook || title || "",
            author: normalize(metadata?.creator || metadata?.["dc:creator"]),
            publisher: normalize(
              metadata?.publisher || metadata?.["dc:publisher"]
            ),
            published: normalize(metadata?.["dc:date"]),
            identifier: normalize(
              metadata?.identifier || metadata?.["dc:identifier"]
            ),
            rights: normalize(metadata?.rights || metadata?.["dc:rights"]),
            description: normalize(
              metadata?.description || metadata?.["dc:description"]
            ),
            language: normalize(
              metadata?.language || metadata?.["dc:language"]
            ),
            subjects: normalize(metadata?.["dc:subject"]),
            coverUrl
          });
        }

        const nav = await book.loaded?.navigation;
        const rawToc = nav?.toc || [];

        try {
          if (book.locations?.generate) {
            await book.locations.generate(1024);
          }
        } catch {
          // ignore location generation failures
        }

        const normalizedToc = annotateTocWithLocations(rawToc, book);
        setTocItems(normalizedToc);
        tocRef.current = normalizedToc;

        let savedCfi: string | null = null;
        try {
          savedCfi = localStorage.getItem(`reader:lastLocation:${url}`);
        } catch {
          savedCfi = null;
        }

        await rendition.display(savedCfi || undefined);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load EPUB.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
      renditionRef.current?.destroy?.();
      bookRef.current?.destroy?.();
    };
  }, [url, authToken, title, setLoading, applyTheme]);

  // --- Sync display settings to the active rendition ---
  // Each effect below responds to a single display preference change and
  // pushes it into the live epubjs rendition without reloading the book.
  React.useEffect(() => {
    renditionRef.current?.themes?.fontSize?.(`${fontSize}%`);
  }, [fontSize]);

  React.useEffect(() => {
    renditionRef.current?.themes?.font?.(resolveFontFamily(fontFamily));
  }, [fontFamily]);

  React.useEffect(() => {
    renditionRef.current?.spread?.(pageView === "spread" ? "auto" : "none");
  }, [pageView]);

  React.useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  React.useEffect(() => {
    if (!showDisplay) return;
    const handlePointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || !displayPanelRef.current) return;
      if (
        displayButtonRef.current?.contains(target) ||
        displayPanelRef.current.contains(target)
      ) {
        return;
      }
      setShowDisplay(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
    };
  }, [showDisplay]);

  React.useEffect(() => {
    setShowToc(false);
    setShowSearch(false);
    setShowDisplay(false);
    setTocTab("toc");
    setCitationDraft("");
    setEditingCitationId(null);
    setEditingCitationDraft("");
    setSelectionPopup(null);
    setPendingCitationText(null);
    try {
      // mergedBookmarks/mergedCitations are populated asynchronously by
      // useAnnotationSync once the server fetch completes. Fall back to local
      // storage here so the reader has data immediately on render.
      setBookmarks(annotationSync.mergedBookmarks ?? loadBookmarks(url));
      setCitations(annotationSync.mergedCitations ?? loadCitations(url));
    } catch {
      setBookmarks([]);
      setCitations([]);
    }
  }, [url]);

  // When the server merge completes (async after mount), update displayed
  // bookmarks and citations if the server returned additional items.
  React.useEffect(() => {
    if (annotationSync.mergedBookmarks !== null) {
      setBookmarks(prev => {
        // Only update if the merged list is actually different (more items)
        if (prev.length >= annotationSync.mergedBookmarks!.length) return prev;
        saveBookmarks(url, annotationSync.mergedBookmarks!);
        return annotationSync.mergedBookmarks!;
      });
    }
  }, [annotationSync.mergedBookmarks, url]);

  React.useEffect(() => {
    if (annotationSync.mergedCitations !== null) {
      setCitations(prev => {
        if (prev.length >= annotationSync.mergedCitations!.length) return prev;
        saveCitations(url, annotationSync.mergedCitations!);
        return annotationSync.mergedCitations!;
      });
    }
  }, [annotationSync.mergedCitations, url]);

  // Flush last position to the server when the tab becomes hidden or the page
  // is about to unload. This ensures the server always holds the most recent
  // position even if the patron closes the tab without turning the page.
  React.useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState !== "hidden") return;
      const cfi = currentCfi;
      if (cfi) annotationSync.flushLastPosition({ cfi });
    };
    const onPageHide = () => {
      const cfi = currentCfi;
      if (cfi) annotationSync.flushLastPosition({ cfi });
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [currentCfi, annotationSync.flushLastPosition]);

  // Arrow keys page through the book unless focus is inside a text input.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        renditionRef.current?.prev?.();
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        renditionRef.current?.next?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const runSearch = async () => {
    if (!searchQuery.trim() || !bookRef.current || searchInProgressRef.current)
      return;
    searchInProgressRef.current = true;
    setIsSearching(true);
    try {
      const results = await performBookSearch(
        bookRef.current,
        searchQuery.trim()
      );
      setSearchResults(results || []);
    } catch {
      setSearchResults([]);
    } finally {
      searchInProgressRef.current = false;
      setIsSearching(false);
    }
  };

  const navigateTo = async (target: string) => {
    if (!target || !renditionRef.current) return;

    const rendition = renditionRef.current;
    const spineItems = bookRef.current?.spine?.spineItems || [];
    const candidates = buildDisplayCandidates(target, spineItems);

    // Also try CFI navigation via epubs's spine if available — some EPUBs only
    // navigate correctly by CFI, not by href, especially for sub-section anchors.
    const { hash } = splitHref(safeDecode(target));
    if (hash) {
      // Try the bare anchor id as a CFI-fragment fallback (epubjs resolves
      // element ids to CFI internally when passed as plain strings starting with #)
      candidates.push(hash);
    }

    for (const candidate of candidates) {
      try {
        await rendition.display(candidate);
        setShowToc(false);
        setShowSearch(false);
        return;
      } catch {
        // try next candidate
      }
    }

    // Navigation failed for all candidates — close the TOC anyway so the
    // user isn't stuck, and do not surface an error for sub-section anchors
    // since many EPUBs emit them even when they aren't navigable positions.
    setShowToc(false);
    setShowSearch(false);
  };

  // --- Header controls ---

  const leftControls = (
    <Stack spacing={2}>
      {readerInfo?.backControl}
      <Button
        variant="ghost"
        color="text"
        iconLeft={Info}
        onClick={readerInfo?.toggleInfo}
        ref={readerInfo?.infoButtonRef}
        aria-label="Information"
        title="Information"
        sx={iconOnlyControlButtonSx}
      />
    </Stack>
  );

  const toggleBookmark = () => {
    if (!currentCfi) return;

    const existingBookmark = bookmarks.find(entry => entry.cfi === currentCfi);
    if (existingBookmark) {
      removeBookmark(existingBookmark.id);
      return;
    }

    addBookmark();
  };

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Text sx={{ color: "ui.error" }}>{error}</Text>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative"
      }}
    >
      <ReaderControls
        title={title || metadataTitle || ""}
        centerTitle
        hideAdjustControls
        hideNavControls
        leftControls={leftControls}
        extraControls={
          <ReaderUtilityControls
            onToggleToc={() => setShowToc(prev => !prev)}
            onToggleSearch={() => setShowSearch(prev => !prev)}
            onToggleTheme={() => setShowDisplay(prev => !prev)}
            onAddBookmark={toggleBookmark}
            bookmarkActive={bookmarkActive}
            tocActive={showToc}
            searchActive={showSearch}
            displayActive={showDisplay}
            tocButtonRef={tocButtonRef}
            searchButtonRef={searchButtonRef}
            displayButtonRef={displayButtonRef}
          />
        }
      />

      {annotationSync.serverResumeLabel && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 2,
            px: 3,
            py: 2,
            bg: "ui.gray.light",
            borderBottom: "1px solid",
            borderColor: "ui.gray.medium"
          }}
        >
          <Text variant="text.detail">
            Continue from {annotationSync.serverResumeLabel}?
          </Text>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              variant="filled"
              color="brand.primary"
              onClick={() => {
                const pos = annotationSync.serverLastPosition as
                  | { cfi: string }
                  | null
                  | undefined;
                if (pos?.cfi) renditionRef.current?.display(pos.cfi);
                annotationSync.dismissServerResume();
              }}
            >
              Jump there
            </Button>
            <Button
              variant="ghost"
              color="text"
              onClick={annotationSync.dismissServerResume}
            >
              Stay here
            </Button>
          </Box>
        </Box>
      )}

      {showToc && (
        <ReaderNavigationPanel
          storageKey="epub"
          activeTab={tocTab}
          onTabChange={setTocTab}
          initialWidth={380}
          minWidth={320}
          maxWidth={760}
          top={64}
          right={16}
          zIndex={6}
          tocContent={
            <Box sx={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
              {tocItems.length ? (
                tocItems.map((item: EpubTocItem, index: number) => (
                  <TocItem
                    key={
                      item?.id ||
                      item?.href ||
                      `${item?.label || item?.title}-${index}`
                    }
                    item={item}
                    depth={0}
                    onSelect={navigateTo}
                    activeHref={currentHref}
                  />
                ))
              ) : (
                <Text variant="text.detail">No table of contents found.</Text>
              )}
            </Box>
          }
          bookmarksContent={
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                flex: 1,
                minHeight: 0,
                overflow: "hidden"
              }}
            >
              <Button
                variant="ghost"
                color="text"
                onClick={addBookmark}
                sx={{ flexShrink: 0 }}
              >
                Bookmark current location
              </Button>
              {sortedBookmarks.length > 0 ? (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    overflowY: "auto",
                    flex: 1,
                    minHeight: 0,
                    pr: 1
                  }}
                >
                  {sortedBookmarks.map(bookmark => (
                    <Box
                      key={bookmark.id}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 2,
                        border: "1px solid",
                        borderColor: "var(--reader-chrome-border, #e2e8f0)",
                        borderRadius: 8,
                        p: 2
                      }}
                    >
                      <Box
                        sx={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          flexDirection: "column",
                          gap: 2
                        }}
                      >
                        <Button
                          variant="ghost"
                          color="text"
                          onClick={() => navigateTo(bookmark.cfi)}
                          sx={{
                            justifyContent: "flex-start",
                            px: 0,
                            py: 0,
                            minHeight: "unset"
                          }}
                        >
                          {bookmark.chapter ||
                            bookmark.pageLabel ||
                            bookmark.label ||
                            "Bookmark"}
                        </Button>
                        {typeof bookmark.progressPercent === "number" && (
                          <Text
                            variant="text.detail"
                            sx={{ color: "ui.gray.dark", m: 0 }}
                          >
                            Progression {bookmark.progressPercent}%
                          </Text>
                        )}
                      </Box>
                      <Button
                        variant="ghost"
                        color="text"
                        iconLeft={Trash}
                        onClick={() => removeBookmark(bookmark.id)}
                      >
                        Remove
                      </Button>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Text variant="text.detail">No bookmarks yet.</Text>
              )}
            </Box>
          }
          annotationsContent={
            <AnnotationPanel
              pendingAnnotationText={pendingCitationText}
              annotationDraft={citationDraft}
              onAnnotationDraftChange={setCitationDraft}
              onRemovePendingAnnotationText={() => setPendingCitationText(null)}
              onAddAnnotation={addCitation}
              annotations={sortedCitations.map(citation => ({
                id: citation.id,
                note: citation.note,
                quotedText: citation.quotedText,
                pageLabel: citation.pageLabel,
                chapter: citation.chapter,
                cfi: citation.cfi
              }))}
              editingAnnotationId={editingCitationId}
              editingAnnotationDraft={editingCitationDraft}
              onEditingAnnotationDraftChange={setEditingCitationDraft}
              onBeginEdit={annotation => {
                const citation = sortedCitations.find(
                  c => c.id === annotation.id
                );
                if (citation) beginCitationEdit(citation);
              }}
              onSaveEdit={saveCitationEdit}
              onCancelEdit={cancelCitationEdit}
              onDelete={removeCitation}
              onCopy={annotation => {
                const citation = sortedCitations.find(
                  c => c.id === annotation.id
                );
                if (citation) copyCitation(citation);
              }}
              onDownload={annotation => {
                const citation = sortedCitations.find(
                  c => c.id === annotation.id
                );
                if (!citation) return;

                downloadAnnotationAsRis(citation, {
                  title: metadataTitle || title,
                  author: metadataAuthor,
                  publisher: metadataPublisher,
                  url: bookUrl || url,
                  referenceType: "EBOOK"
                });
              }}
              onNavigate={annotation => {
                if (annotation.cfi) navigateTo(annotation.cfi);
              }}
              saveButtonLabel="Save note"
              draftPlaceholder="Type a note"
              citationBookTitle={metadataTitle || title}
              citationAuthor={metadataAuthor}
              citationPublisher={metadataPublisher}
            />
          }
        />
      )}

      {showSearch && (
        <Box sx={panelStyles.left}>
          <Stack spacing={2} sx={{ mb: 2 }}>
            <InputBox
              as="input"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") runSearch();
              }}
              placeholder="Search in book"
              sx={inputStyles}
            />
            <Button
              variant="ghost"
              color="text"
              onClick={runSearch}
              disabled={isSearching}
            >
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </Stack>
          <Box sx={{ overflowY: "auto", maxHeight: "50vh" }}>
            {searchResults.length ? (
              <Stack direction="column" spacing={2}>
                {searchResults.map(
                  (result: EpubSearchResult, index: number) => (
                    <Box
                      key={`${result?.cfi || "result"}-${index}`}
                      sx={resultCardStyles}
                      onClick={() => {
                        if (result.cfi) {
                          navigateTo(result.cfi);
                        }
                      }}
                    >
                      <Text
                        variant="text.body.regular"
                        sx={{ fontWeight: 600 }}
                      >
                        {result?.excerpt || result?.text || "Search result"}
                      </Text>
                    </Box>
                  )
                )}
              </Stack>
            ) : (
              <Text variant="text.detail">No results.</Text>
            )}
          </Box>
        </Box>
      )}

      {showDisplay && (
        <Box ref={displayPanelRef} sx={panelStyles.right}>
          <Text variant="text.body.regular" sx={{ fontWeight: 600, mb: 2 }}>
            Display
          </Text>
          <Text variant="text.detail" sx={{ mb: 1 }}>
            Font size
          </Text>
          <Stack spacing={2} sx={{ mb: 2 }}>
            <Button
              variant="ghost"
              color="text"
              onClick={() => setFontSize(prev => Math.max(70, prev - 10))}
            >
              A-
            </Button>
            <Button
              variant="ghost"
              color="text"
              onClick={() => setFontSize(prev => Math.min(200, prev + 10))}
            >
              A+
            </Button>
          </Stack>
          <Text variant="text.detail" sx={{ mb: 1 }}>
            Theme
          </Text>
          <Stack spacing={2} sx={{ mb: 2 }}>
            <Button
              variant={theme === "light" ? "filled" : "ghost"}
              color="text"
              onClick={() => setTheme("light")}
            >
              Light
            </Button>
            <Button
              variant={theme === "dark" ? "filled" : "ghost"}
              color="text"
              onClick={() => setTheme("dark")}
            >
              Dark
            </Button>
          </Stack>
          <Text variant="text.detail" sx={{ mb: 1 }}>
            Font
          </Text>
          <Stack spacing={2} sx={{ mb: 2 }}>
            <Button
              variant={fontFamily === "publisher" ? "filled" : "ghost"}
              color="text"
              onClick={() => setFontFamily("publisher")}
            >
              Publisher
            </Button>
            <Button
              variant={fontFamily === "system" ? "filled" : "ghost"}
              color="text"
              onClick={() => setFontFamily("system")}
            >
              System
            </Button>
            <Button
              variant={fontFamily === "sans" ? "filled" : "ghost"}
              color="text"
              onClick={() => setFontFamily("sans")}
            >
              Sans
            </Button>
          </Stack>
          <Text variant="text.detail" sx={{ mb: 1 }}>
            Layout
          </Text>
          <Stack spacing={2}>
            <Button
              variant={pageView === "single" ? "filled" : "ghost"}
              color="text"
              onClick={() => setPageView("single")}
            >
              Single
            </Button>
            <Button
              variant={pageView === "spread" ? "filled" : "ghost"}
              color="text"
              onClick={() => setPageView("spread")}
            >
              Spread
            </Button>
          </Stack>
        </Box>
      )}

      <Box sx={{ position: "relative", flex: 1, minHeight: 0 }}>
        <Box ref={containerRef} sx={{ width: "100%", height: "100%" }} />
        <Box
          as="button"
          onClick={() => renditionRef.current?.prev?.()}
          aria-label="previous page"
          sx={edgeButtonStyles.left}
        />
        <Box
          as="button"
          onClick={() => renditionRef.current?.next?.()}
          aria-label="Next Page"
          sx={edgeButtonStyles.right}
        />

        <Button
          variant="ghost"
          color="text"
          iconLeft={ChevronLeft}
          onClick={() => renditionRef.current?.prev?.()}
          aria-label="previous page"
          title="previous page"
          sx={floatingNavStyles.left}
        />
        <Button
          variant="ghost"
          color="text"
          iconLeft={ChevronRight}
          onClick={() => renditionRef.current?.next?.()}
          aria-label="Next Page"
          title="Next Page"
          sx={floatingNavStyles.right}
        />
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 3,
          py: 2,
          borderTop: "1px solid",
          borderColor: "var(--reader-chrome-border, #e2e8f0)",
          background: "var(--reader-chrome-bg, #ffffff)",
          color: "var(--reader-chrome-text, inherit)"
        }}
      >
        <Text
          variant="text.detail"
          sx={{ color: "ui.gray.dark", textAlign: "center", width: "100%" }}
        >
          {progressLabel || " "}
        </Text>
      </Box>
      {selectionPopup && (
        <Box
          sx={{
            position: "fixed",
            left: selectionPopup.x,
            top: selectionPopup.y - 52,
            zIndex: 1000,
            background: "var(--reader-chrome-bg, #ffffff)",
            color: "var(--reader-chrome-text, #0f172a)",
            border: "1px solid",
            borderColor: "var(--reader-chrome-border, #e2e8f0)",
            borderRadius: 8,
            px: 1,
            py: "4px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
            display: "flex",
            alignItems: "center",
            transform: "translateX(-50%)",
            pointerEvents: "all"
          }}
        >
          <Button
            variant="ghost"
            color="text"
            sx={{
              color: "var(--reader-chrome-text, #0f172a)",
              minHeight: "unset",
              py: "4px",
              px: 2,
              fontSize: 1
            }}
            onClick={() => {
              setPendingCitationText(selectionPopup.text);
              setCitationDraft("");
              setShowToc(true);
              setTocTab("annotations");
              setShowSearch(false);
              setShowDisplay(false);
              setSelectionPopup(null);
              // Clear the iframe selection
              try {
                const iframeEl = containerRef.current?.querySelector("iframe");
                const iframeWin = (iframeEl as HTMLIFrameElement | null)
                  ?.contentWindow;
                iframeWin?.getSelection?.()?.removeAllRanges?.();
              } catch {
                // ignore
              }
            }}
          >
            Create Citation
          </Button>
          <Box
            sx={{
              width: "1px",
              alignSelf: "stretch",
              background: "var(--reader-chrome-border, #e2e8f0)"
            }}
          />
          <Button
            variant="ghost"
            color="text"
            sx={{
              color: "var(--reader-chrome-text, #0f172a)",
              minHeight: "unset",
              py: "4px",
              px: 2,
              fontSize: 1
            }}
            onClick={() => setSelectionPopup(null)}
          >
            ✕
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default EpubReader;

// Returns the identifier only if it is a usable HTTP(S) URI.
// URNs, UUIDs, and plain numbers are not meaningful citation links
// and return undefined so callers fall back to bookUrl or the fulfillment URL.
const _formatIdentifierAsLink = (
  id: string | undefined
): string | undefined => {
  if (!id) return undefined;
  const s = id.trim();
  if (s.startsWith("https://") || s.startsWith("http://")) return s;
  return undefined;
};

const resolveFontFamily = (choice: string) => {
  switch (choice) {
    case "system":
      return "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
    case "publisher":
      return "inherit";
    case "sans":
      return "Avenir Next, Avenir, Gill Sans, Helvetica, Arial, sans-serif";
    default:
      return choice;
  }
};

const normalize = (value: unknown): string => {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map(item => String(item ?? ""))
      .filter(Boolean)
      .join(", ");
  }
  return String(value);
};

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const cleanPath = (value: string) => {
  const noLeading = value.replace(/^\/?(\.\/)+/, "").replace(/^\//, "");
  return noLeading.replace(/^(\.\.\/)+/, "");
};

const splitHref = (value: string) => {
  const idx = value.indexOf("#");
  if (idx < 0) return { path: value, hash: "" };
  return { path: value.slice(0, idx), hash: value.slice(idx) };
};

// buildDisplayCandidates generates a prioritised list of targets to pass to
// rendition.display().  epubjs accepts CFIs, bare filenames, relative paths,
// and full hrefs — we generate all variants so TOC links that use different
// path formats still resolve without errors surfacing to the user.
const buildDisplayCandidates = (
  target: string,
  spineItems: EpubSpineItem[] = []
) => {
  // We collect two ordered lists: hash-bearing variants (which preserve the
  // anchor so epubjs scrolls to the right element) and path-only fallbacks.
  // Hash-bearing candidates must be tried first — if a path-only variant
  // succeeds first, epubjs sees target === section.href and silently drops the
  // anchor, leaving the reader at the top of the section instead of the
  // subsection heading.
  const withHash: string[] = [];
  const noHash: string[] = [];

  const seen = new Set<string>();
  const pushWith = (value?: string) => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      withHash.push(trimmed);
    }
  };
  const pushNo = (value?: string) => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      noHash.push(trimmed);
    }
  };

  const raw = target.trim();
  const decoded = safeDecode(raw);

  [raw, decoded].forEach(source => {
    const { path, hash } = splitHref(source);
    if (!path) return;

    const cleaned = cleanPath(path);
    const basename = cleaned.split("/").pop() || "";

    // Prefer hash-bearing forms first so the anchor is preserved.
    if (hash) {
      pushWith(source);
      pushWith(`${cleaned}${hash}`);
      pushWith(`${basename}${hash}`);
    }

    // Path-only fallbacks (navigate to section start, no anchor).
    pushNo(source.split("#")[0]);
    pushNo(cleaned);
    pushNo(basename);

    try {
      const parsed = new URL(source);
      const parsedPath = cleanPath(parsed.pathname);
      const parsedHash = parsed.hash || hash;
      const parsedBase = parsedPath.split("/").pop() || "";
      if (parsedHash) {
        pushWith(`${parsedPath}${parsedHash}`);
        pushWith(`${parsedBase}${parsedHash}`);
      }
      pushNo(parsedPath);
      pushNo(parsedBase);
    } catch {
      // not an absolute URL
    }

    for (const item of spineItems) {
      const spineHref = typeof item?.href === "string" ? item.href : "";
      if (!spineHref) continue;
      const spineClean = cleanPath(spineHref);
      const spineBase = spineClean.split("/").pop() || "";

      if (
        spineClean === cleaned ||
        spineBase === basename ||
        cleaned.endsWith(spineClean)
      ) {
        if (hash) {
          pushWith(`${spineHref}${hash}`);
          pushWith(`${spineClean}${hash}`);
        }
        pushNo(spineHref);
        pushNo(spineClean);
      }
    }
  });

  return [...withHash, ...noHash];
};

const resolveTocItemPosition = (
  item: EpubTocItem,
  book: EpubBookLike | null | undefined
): { pageNumber?: number; locationIndex?: number } => {
  const locations = book?.locations;
  if (!locations?.locationFromCfi) return {};

  const normalizeLoc = (value: unknown): number | undefined => {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.max(1, Math.round(value));
  };

  const itemCfi = typeof item?.cfi === "string" ? item.cfi : "";
  if (itemCfi) {
    try {
      const fromCfi = locations.locationFromCfi(itemCfi);
      const normalized = normalizeLoc(fromCfi);
      if (normalized)
        return { pageNumber: normalized, locationIndex: normalized };
    } catch {
      // ignore cfi lookup errors
    }
  }

  const itemHref = typeof item?.href === "string" ? item.href : "";
  if (!itemHref) return {};

  const { path } = splitHref(safeDecode(itemHref));
  const cleaned = cleanPath(path);
  const basename = cleaned.split("/").pop() || "";
  const spineItems = book?.spine?.spineItems || [];

  for (let i = 0; i < spineItems.length; i += 1) {
    const spine = spineItems[i];
    const spineHref = typeof spine?.href === "string" ? spine.href : "";
    if (!spineHref) continue;

    const spineClean = cleanPath(spineHref);
    const spineBase = spineClean.split("/").pop() || "";
    if (
      spineClean === cleaned ||
      spineBase === basename ||
      cleaned.endsWith(spineClean)
    ) {
      const cfiBase = typeof spine?.cfiBase === "string" ? spine.cfiBase : "";
      if (!cfiBase) continue;
      try {
        const fromBase = locations.locationFromCfi(cfiBase);
        const normalized = normalizeLoc(fromBase);
        if (normalized)
          return { pageNumber: normalized, locationIndex: normalized };
      } catch {
        // ignore cfiBase lookup errors
      }

      // Fallback when cfiBase cannot be converted: use spine order as a location hint.
      return { locationIndex: i + 1 };
    }
  }

  return {};
};

const annotateTocWithLocations = (
  items: EpubTocItem[] = [],
  book: EpubBookLike | null | undefined
): EpubTocItem[] => {
  return items.map(item => ({
    ...item,
    ...resolveTocItemPosition(item, book),
    subitems: annotateTocWithLocations(
      Array.isArray(item?.subitems) ? item.subitems : [],
      book
    )
  }));
};

const tocHrefMatches = (a: string, b: string) => {
  const aPath = cleanPath(splitHref(safeDecode(a)).path);
  const bPath = cleanPath(splitHref(safeDecode(b)).path);
  return aPath === bPath;
};

const findTocLabel = (
  items: EpubTocItem[] = [],
  href: string
): string | undefined => {
  for (const item of items) {
    if (!item) continue;
    if (item.href && href && tocHrefMatches(item.href, href)) {
      return item.label || item.title;
    }
    if (Array.isArray(item.subitems)) {
      const found = findTocLabel(item.subitems, href);
      if (found) return found;
    }
  }
  return undefined;
};

const TocItem: React.FC<{
  item: EpubTocItem;
  depth: number;
  onSelect: (href: string) => void;
  activeHref?: string;
  parentHref?: string;
}> = ({ item, depth, onSelect, activeHref, parentHref }) => {
  const [expanded, setExpanded] = React.useState(depth < 1);
  const label = item?.label || item?.title || "Untitled";
  const href = typeof item?.href === "string" ? item.href : "";
  const rawSubitems = Array.isArray(item?.subitems) ? item.subitems : [];
  // Deduplicate: skip child items whose href is identical to the parent's href
  // — some EPUBs repeat the section link as the first child, causing a visual
  // duplicate when the parent is expanded.
  const subitems = parentHref
    ? rawSubitems.filter(
        child =>
          !(
            typeof child?.href === "string" &&
            tocHrefMatches(child.href, parentHref)
          )
      )
    : rawSubitems;
  const hasChildren = subitems.length > 0;
  const pageNumber =
    typeof item?.pageNumber === "number" && Number.isFinite(item.pageNumber)
      ? Math.max(1, Math.round(item.pageNumber))
      : undefined;
  const locationIndex =
    typeof item?.locationIndex === "number" &&
    Number.isFinite(item.locationIndex)
      ? Math.max(1, Math.round(item.locationIndex))
      : undefined;
  const isActive =
    href && activeHref ? tocHrefMatches(href, activeHref) : false;
  const isHeading = !href && hasChildren;
  const itemFontWeight = isHeading ? 700 : depth > 0 ? 400 : 600;

  // Row: expand chevron + label are sibling elements (never nested buttons).
  // Having a <button> inside a <button> is invalid HTML — the browser promotes
  // the inner one, which broke expand and navigation for nested TOC items.
  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          pl: 2 + depth * 3,
          pr: 2
        }}
      >
        {/* Expand / collapse chevron — only shown when there are children */}
        {hasChildren ? (
          <Box
            as="button"
            onClick={() => setExpanded(prev => !prev)}
            aria-label={expanded ? "Collapse" : "Expand"}
            sx={{
              appearance: "none",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              px: 1,
              py: 2,
              lineHeight: 1,
              flexShrink: 0,
              color: "var(--reader-chrome-text, inherit)",
              "&:focus,&:hover": { opacity: 0.7 }
            }}
          >
            {expanded ? "▾" : "▸"}
          </Box>
        ) : (
          <Box as="span" sx={{ width: 20, flexShrink: 0 }} />
        )}

        {/* Navigation label — its own button, never a parent of another button */}
        <Box
          as={href ? "button" : "div"}
          onClick={href ? () => onSelect(href) : undefined}
          sx={{
            appearance: "none",
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "flex-start",
            gap: 2,
            background: "transparent",
            borderRadius: 8,
            border: "1px solid",
            borderColor: isActive
              ? "var(--reader-chrome-text, #0f172a)"
              : "transparent",
            cursor: href ? "pointer" : "default",
            textAlign: "left",
            py: 2,
            pr: 1,
            color: "var(--reader-chrome-text, inherit)",
            "&:focus,&:hover": {
              background: href ? "rgba(148, 163, 184, 0.14)" : "transparent",
              textDecoration: "none"
            },
            "&:active": {
              background: href ? "rgba(148, 163, 184, 0.22)" : "transparent"
            }
          }}
        >
          <Box
            as="span"
            sx={{
              flex: 1,
              minWidth: 0,
              overflowWrap: "anywhere",
              lineHeight: 1.25,
              fontWeight: itemFontWeight
            }}
          >
            {label}
          </Box>
          {pageNumber ? (
            <Box as="span" sx={{ whiteSpace: "nowrap", opacity: 0.8 }}>
              p. {pageNumber}
            </Box>
          ) : locationIndex ? (
            <Box as="span" sx={{ whiteSpace: "nowrap", opacity: 0.7 }}>
              loc. {locationIndex}
            </Box>
          ) : (
            <span />
          )}
        </Box>
      </Box>

      {hasChildren && expanded && (
        <Box>
          {subitems.map((child: EpubTocItem, index: number) => (
            <TocItem
              key={
                child?.id ||
                child?.href ||
                `${child?.label || child?.title}-${index}`
              }
              item={child}
              depth={depth + 1}
              onSelect={onSelect}
              activeHref={activeHref}
              parentHref={href || parentHref}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

const panelStyles: { right: ThemeUIStyleObject; left: ThemeUIStyleObject } = {
  right: {
    position: "absolute",
    top: 64,
    right: 16,
    width: ["88vw", "380px"],
    maxWidth: "420px",
    maxHeight: "70vh",
    overflow: "hidden",
    border: "1px solid",
    borderColor: "var(--reader-chrome-border, #e2e8f0)",
    borderRadius: 10,
    background: "var(--reader-chrome-bg, #ffffff)",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
    zIndex: 6,
    p: 2
  },
  left: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: ["88vw", "400px"],
    maxHeight: "70vh",
    overflow: "hidden",
    border: "1px solid",
    borderColor: "var(--reader-chrome-border, #e2e8f0)",
    borderRadius: 10,
    background: "var(--reader-chrome-bg, #ffffff)",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
    zIndex: 6,
    p: 2
  }
};

const inputStyles: ThemeUIStyleObject = {
  width: "100%",
  border: "1px solid var(--reader-chrome-border, #e2e8f0)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--reader-chrome-text, inherit)",
  background: "transparent"
};

const resultCardStyles: ThemeUIStyleObject = {
  border: "1px solid",
  borderColor: "var(--reader-chrome-border, #e2e8f0)",
  borderRadius: 8,
  p: 2,
  cursor: "pointer"
};

const edgeButtonStyles: {
  left: ThemeUIStyleObject;
  right: ThemeUIStyleObject;
} = {
  left: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "10%",
    minWidth: 40,
    height: "100%",
    border: 0,
    bg: "transparent",
    cursor: "pointer"
  },
  right: {
    position: "absolute",
    top: 0,
    right: 0,
    width: "10%",
    minWidth: 40,
    height: "100%",
    border: 0,
    bg: "transparent",
    cursor: "pointer"
  }
};

const floatingNavStyles: {
  left: ThemeUIStyleObject;
  right: ThemeUIStyleObject;
} = {
  left: {
    position: "absolute",
    left: 10,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 3,
    opacity: 0.7
  },
  right: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 3,
    opacity: 0.7
  }
};

const iconOnlyControlButtonSx: ThemeUIStyleObject = {
  px: 2,
  minWidth: 44,
  "& svg": {
    width: "1.5em",
    height: "1.5em",
    mr: 0,
    ml: 0
  }
};
