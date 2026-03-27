/* eslint-disable prettier/prettier */
/* eslint-disable react-hooks/exhaustive-deps */
import * as React from "react";
import { Box } from "theme-ui";
import { Text } from "components/Text";
import Button from "components/Button";
import ChevronLeft from "icons/ChevronLeft";
import ChevronRight from "icons/ChevronRight";
import Info from "icons/Info";
import Trash from "icons/Trash";
import Copy from "icons/Copy";
import Stack from "components/Stack";
import ReaderControls from "../ReaderControls";
import ReaderUtilityControls from "../ReaderUtilityControls";
import { useReaderInfo } from "../ReaderWrapper";
import { getProxiedUrl } from "utils/proxyUrl";
import { performBookSearch } from "utils/readerSearch";
import {
  type ReaderBookmark,
  type ReaderCitation,
  loadBookmarks,
  saveBookmarks,
  loadCitations,
  saveCitations,
  createId
} from "utils/readerAnnotations";

const InputBox = Box as any;

type EpubReaderProps = {
  url: string;
  authToken?: string;
  title?: string;
  setLoading: (value: boolean) => void;
};

const EpubReader: React.FC<EpubReaderProps> = ({
  url,
  authToken,
  title,
  setLoading
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const bookRef = React.useRef<any>(null);
  const renditionRef = React.useRef<any>(null);
  const tocRef = React.useRef<any[]>([]);

  const [error, setError] = React.useState<string | null>(null);
  const [progressLabel, setProgressLabel] = React.useState("");
  const [metadataTitle, setMetadataTitle] = React.useState("");
  const [fontSize, setFontSize] = React.useState(100);
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const [fontFamily, setFontFamily] = React.useState("publisher");
  const [pageView, setPageView] = React.useState<"single" | "spread">("single");
  const [tocItems, setTocItems] = React.useState<any[]>([]);
  const [showToc, setShowToc] = React.useState(false);
  const [tocTab, setTocTab] = React.useState<"toc" | "bookmarks" | "annotations">("toc");
  const [showSearch, setShowSearch] = React.useState(false);
  const [showDisplay, setShowDisplay] = React.useState(false);
  const [currentChapter, setCurrentChapter] = React.useState("");
  const [currentCfi, setCurrentCfi] = React.useState("");
  const [currentHref, setCurrentHref] = React.useState("");
  const [currentPageLabel, setCurrentPageLabel] = React.useState("");
  const [bookmarks, setBookmarks] = React.useState<ReaderBookmark[]>([]);
  const [citations, setCitations] = React.useState<ReaderCitation[]>([]);
  const [citationDraft, setCitationDraft] = React.useState("");
  const [editingCitationId, setEditingCitationId] = React.useState<string | null>(null);
  const [editingCitationDraft, setEditingCitationDraft] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);

  const searchInProgressRef = React.useRef(false);
  const displayPanelRef = React.useRef<HTMLDivElement | null>(null);
  const displayButtonRef = React.useRef<HTMLButtonElement>(null as unknown as HTMLButtonElement);
  const tocButtonRef = React.useRef<HTMLButtonElement>(null as unknown as HTMLButtonElement);
  const searchButtonRef = React.useRef<HTMLButtonElement>(null as unknown as HTMLButtonElement);

  const readerInfo = useReaderInfo();

  const applyTheme = React.useCallback((next: "light" | "dark") => {
    const rendition = renditionRef.current;
    rendition?.themes?.select?.(next);
    const bg = next === "dark" ? "#0f172a" : "#ffffff";
    const fg = next === "dark" ? "#e2e8f0" : "#0f172a";

    try {
      rendition?.views?.().forEach((view: any) => {
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
      root.style.setProperty("--reader-chrome-bg", next === "dark" ? "#0b1220" : "#ffffff");
      root.style.setProperty("--reader-chrome-text", next === "dark" ? "#e2e8f0" : "#0f172a");
      root.style.setProperty("--reader-chrome-border", next === "dark" ? "#1f2937" : "#e2e8f0");
    } catch {
      // ignore css variable errors
    }
  }, []);

  React.useEffect(() => {
    tocRef.current = tocItems;
  }, [tocItems]);

  React.useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(getProxiedUrl(url), {
          headers: authToken ? { "X-Reader-Authorization": authToken } : undefined
        });
        if (!response.ok) throw new Error(`Failed to load EPUB (${response.status})`);

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

        const book = ePub(buffer);
        bookRef.current = book;

        const rendition = book.renderTo(containerRef.current, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: pageView === "spread" ? "auto" : "none"
        });
        renditionRef.current = rendition;

        rendition.themes.register("light", {
          body: { background: "#ffffff", color: "#0f172a" },
          html: { background: "#ffffff", color: "#0f172a" }
        });
        rendition.themes.register("dark", {
          body: { background: "#0f172a", color: "#e2e8f0" },
          html: { background: "#0f172a", color: "#e2e8f0" }
        });

        rendition.themes.fontSize(`${fontSize}%`);
        rendition.themes.font(resolveFontFamily(fontFamily));
        rendition.spread?.(pageView === "spread" ? "auto" : "none");
        applyTheme(theme);

        rendition.on("relocated", (location: any) => {
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
          }

          if (href) {
            setCurrentHref(href);
            const label = findTocLabel(bookRef.current?.navigation?.toc || tocRef.current, href);
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

        const metadata = (await book.loaded?.metadata) || {};
        const titleFromBook = normalize(metadata?.title || metadata?.["dc:title"] || "");
        if (titleFromBook) setMetadataTitle(titleFromBook);
        if (readerInfo?.setBookInfo) {
          readerInfo.setBookInfo({
            title: titleFromBook || title || "",
            author: normalize(metadata?.creator || metadata?.["dc:creator"]),
            publisher: normalize(metadata?.publisher || metadata?.["dc:publisher"]),
            published: normalize(metadata?.["dc:date"]),
            identifier: normalize(metadata?.identifier || metadata?.["dc:identifier"]),
            rights: normalize(metadata?.rights || metadata?.["dc:rights"]),
            description: normalize(metadata?.description || metadata?.["dc:description"]),
            language: normalize(metadata?.language || metadata?.["dc:language"]),
            subjects: normalize(metadata?.["dc:subject"])
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
    try {
      setBookmarks(loadBookmarks(url));
      setCitations(loadCitations(url));
    } catch {
      setBookmarks([]);
      setCitations([]);
    }
  }, [url]);

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
    if (!searchQuery.trim() || !bookRef.current || searchInProgressRef.current) return;
    searchInProgressRef.current = true;
    setIsSearching(true);
    try {
      const results = await performBookSearch(bookRef.current, searchQuery.trim());
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

    // Do not throw to the browser console; surface a user-facing error instead.
    setError("Unable to navigate to this section. The EPUB TOC link may be malformed.");
  };

  const addBookmark = () => {
    if (!currentCfi) return;
    let locationIndex: number | undefined;
    let progressPercent: number | undefined;
    try {
      const locations = bookRef.current?.locations;
      if (locations?.locationFromCfi && locations?.percentageFromCfi) {
        const loc = locations.locationFromCfi(currentCfi);
        if (typeof loc === "number" && Number.isFinite(loc)) {
          locationIndex = Math.max(1, Math.round(loc));
        }
        const pct = locations.percentageFromCfi(currentCfi);
        if (typeof pct === "number" && Number.isFinite(pct)) {
          progressPercent = Math.max(0, Math.min(100, Math.round(pct * 100)));
        }
      }
    } catch {
      // ignore location metadata errors
    }
    const bookmark: ReaderBookmark = {
      id: createId(),
      cfi: currentCfi,
      label: currentChapter || currentPageLabel || "Bookmark",
      chapter: currentChapter || undefined,
      pageLabel: currentPageLabel || undefined,
      locationIndex,
      progressPercent,
      createdAt: Date.now()
    };
    const next = [bookmark, ...bookmarks.filter(entry => entry.cfi !== currentCfi)];
    setBookmarks(next);
    saveBookmarks(url, next);
  };

  const removeBookmark = (id: string) => {
    const next = bookmarks.filter(entry => entry.id !== id);
    setBookmarks(next);
    saveBookmarks(url, next);
  };

  const addCitation = () => {
    const note = citationDraft.trim();
    if (!currentCfi || !note) return;
    const citation: ReaderCitation = {
      id: createId(),
      cfi: currentCfi,
      note,
      chapter: currentChapter || undefined,
      pageLabel: currentPageLabel || undefined,
      createdAt: Date.now()
    };
    const next = [citation, ...citations];
    setCitations(next);
    saveCitations(url, next);
    setCitationDraft("");
  };

  const removeCitation = (id: string) => {
    const next = citations.filter(entry => entry.id !== id);
    setCitations(next);
    saveCitations(url, next);
    if (editingCitationId === id) {
      setEditingCitationId(null);
      setEditingCitationDraft("");
    }
  };

  const beginCitationEdit = (citation: ReaderCitation) => {
    setEditingCitationId(citation.id);
    setEditingCitationDraft(citation.note);
  };

  const cancelCitationEdit = () => {
    setEditingCitationId(null);
    setEditingCitationDraft("");
  };

  const saveCitationEdit = () => {
    const note = editingCitationDraft.trim();
    if (!editingCitationId || !note) return;
    const next = citations.map(entry =>
      entry.id === editingCitationId
        ? {
            ...entry,
            note
          }
        : entry
    );
    setCitations(next);
    saveCitations(url, next);
    setEditingCitationId(null);
    setEditingCitationDraft("");
  };

  const copyCitation = async (citation: ReaderCitation) => {
    const page = citation.pageLabel ? ` (${citation.pageLabel})` : "";
    const chapter = citation.chapter || "Untitled";
    const payload = `${chapter}${page}\n${url}\n${citation.note}`;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // ignore clipboard errors
    }
  };

  const sortedBookmarks = React.useMemo(
    () =>
      bookmarks
        .slice()
        .sort((a, b) => (a.locationIndex ?? Number.MAX_SAFE_INTEGER) - (b.locationIndex ?? Number.MAX_SAFE_INTEGER)),
    [bookmarks]
  );

  const sortedCitations = React.useMemo(
    () => citations.slice().sort((a, b) => b.createdAt - a.createdAt),
    [citations]
  );

  const leftControls = (
    <Stack spacing={2}>
      {readerInfo?.backControl}
      <Button
        variant="ghost"
        color="text"
        iconLeft={Info}
        onClick={readerInfo?.toggleInfo}
        ref={readerInfo?.infoButtonRef}
      >
        Info
      </Button>
    </Stack>
  );

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
            onAddBookmark={addBookmark}
            tocActive={showToc}
            searchActive={showSearch}
            displayActive={showDisplay}
            tocButtonRef={tocButtonRef}
            searchButtonRef={searchButtonRef}
            displayButtonRef={displayButtonRef}
          />
        }
      />

      {showToc && (
        <Box sx={panelStyles.right as any}>
          <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
            {(
              [
                { key: "toc", label: "TOC" },
                { key: "bookmarks", label: "Bookmarks" },
                { key: "annotations", label: "Annotations" }
              ] as const
            ).map(tab => (
              <Button
                key={tab.key}
                variant={tocTab === tab.key ? "filled" : "ghost"}
                color="text"
                onClick={() => setTocTab(tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </Box>

          {tocTab === "toc" && (
            <Box sx={{ overflowY: "auto", maxHeight: "60vh" }}>
              {tocItems.length ? (
                tocItems.map((item: any, index: number) => (
                  <TocItem
                    key={item?.id || item?.href || `${item?.label || item?.title}-${index}`}
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
          )}

          {tocTab === "bookmarks" && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Button variant="ghost" color="text" onClick={addBookmark}>
                Bookmark current location
              </Button>
              {sortedBookmarks.length > 0 ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, overflowY: "auto", maxHeight: "52vh", pr: 1 }}>
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
                      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                        <Button
                          variant="ghost"
                          color="text"
                          onClick={() => navigateTo(bookmark.cfi)}
                          sx={{ justifyContent: "flex-start", px: 0, py: 0, minHeight: "unset" }}
                        >
                          {bookmark.chapter || bookmark.pageLabel || bookmark.label || "Bookmark"}
                        </Button>
                        {typeof bookmark.progressPercent === "number" && (
                          <Text variant="text.detail" sx={{ color: "ui.gray.dark", m: 0 }}>
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
          )}

          {tocTab === "annotations" && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
                Add a note for the current location
              </Text>
              <InputBox
                as="textarea"
                value={citationDraft}
                onChange={e => setCitationDraft(e.target.value)}
                placeholder="Type a note"
                sx={{
                  width: "100%",
                  minHeight: 84,
                  border: "1px solid",
                  borderColor: "var(--reader-chrome-border, #e2e8f0)",
                  borderRadius: 8,
                  p: 2,
                  background: "transparent",
                  color: "var(--reader-chrome-text, inherit)"
                }}
              />
              <Box>
                <Button variant="ghost" color="text" onClick={addCitation}>
                  Save note
                </Button>
              </Box>

              {sortedCitations.length > 0 ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {sortedCitations.map(citation => (
                    <Box
                      key={citation.id}
                      sx={{
                        border: "1px solid",
                        borderColor: "var(--reader-chrome-border, #e2e8f0)",
                        borderRadius: 8,
                        p: 2
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 2,
                          mb: 1
                        }}
                      >
                        <Button
                          variant="ghost"
                          color="text"
                          onClick={() => navigateTo(citation.cfi)}
                        >
                          {citation.chapter || citation.pageLabel || "Annotation"}
                        </Button>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Button
                            variant="ghost"
                            color="text"
                            onClick={() => beginCitationEdit(citation)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            color="text"
                            iconLeft={Trash}
                            onClick={() => removeCitation(citation.id)}
                          >
                            Remove
                          </Button>
                        </Box>
                      </Box>
                      {editingCitationId === citation.id ? (
                        <>
                          <InputBox
                            as="textarea"
                            value={editingCitationDraft}
                            onChange={e => setEditingCitationDraft(e.target.value)}
                            sx={{
                              width: "100%",
                              minHeight: 84,
                              border: "1px solid",
                              borderColor: "var(--reader-chrome-border, #e2e8f0)",
                              borderRadius: 8,
                              p: 2,
                              mb: 2,
                              background: "transparent",
                              color: "var(--reader-chrome-text, inherit)"
                            }}
                          />
                          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                            <Button
                              variant="ghost"
                              color="text"
                              onClick={saveCitationEdit}
                              disabled={!editingCitationDraft.trim()}
                            >
                              Save
                            </Button>
                            <Button variant="ghost" color="text" onClick={cancelCitationEdit}>
                              Cancel
                            </Button>
                          </Box>
                        </>
                      ) : (
                        <>
                          <Text variant="text.detail" sx={{ mb: 2 }}>
                            {citation.note}
                          </Text>
                          {citation.pageLabel && (
                            <Text variant="text.detail" sx={{ color: "ui.gray.dark", mb: 2 }}>
                              {citation.pageLabel}
                            </Text>
                          )}
                          <Button
                            variant="ghost"
                            color="text"
                            iconLeft={Copy}
                            onClick={() => copyCitation(citation)}
                          >
                            Copy
                          </Button>
                        </>
                      )}
                    </Box>
                  ))}
                </Box>
              ) : (
                <Text variant="text.detail">No annotations yet.</Text>
              )}
            </Box>
          )}
        </Box>
      )}

      {showSearch && (
        <Box sx={panelStyles.left as any}>
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
            <Button variant="ghost" color="text" onClick={runSearch} disabled={isSearching}>
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </Stack>
          <Box sx={{ overflowY: "auto", maxHeight: "50vh" }}>
            {searchResults.length ? (
              <Stack direction="column" spacing={2}>
                {searchResults.map((result: any, index: number) => (
                  <Box
                    key={`${result?.cfi || "result"}-${index}`}
                    sx={resultCardStyles}
                    onClick={() => navigateTo(result.cfi)}
                  >
                    <Text variant="text.body.regular" sx={{ fontWeight: 600 }}>
                      {result?.excerpt || result?.text || "Search result"}
                    </Text>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Text variant="text.detail">No results.</Text>
            )}
          </Box>
        </Box>
      )}

      {showDisplay && (
        <Box ref={displayPanelRef} sx={panelStyles.right as any}>
          <Text variant="text.body.regular" sx={{ fontWeight: 600, mb: 2 }}>
            Display
          </Text>
          <Text variant="text.detail" sx={{ mb: 1 }}>
            Font size
          </Text>
          <Stack spacing={2} sx={{ mb: 2 }}>
            <Button variant="ghost" color="text" onClick={() => setFontSize(prev => Math.max(70, prev - 10))}>
              A-
            </Button>
            <Button variant="ghost" color="text" onClick={() => setFontSize(prev => Math.min(200, prev + 10))}>
              A+
            </Button>
          </Stack>
          <Text variant="text.detail" sx={{ mb: 1 }}>
            Theme
          </Text>
          <Stack spacing={2} sx={{ mb: 2 }}>
            <Button variant={theme === "light" ? "filled" : "ghost"} color="text" onClick={() => setTheme("light")}>
              Light
            </Button>
            <Button variant={theme === "dark" ? "filled" : "ghost"} color="text" onClick={() => setTheme("dark")}>
              Dark
            </Button>
          </Stack>
          <Text variant="text.detail" sx={{ mb: 1 }}>
            Font
          </Text>
          <Stack spacing={2} sx={{ mb: 2 }}>
            <Button variant={fontFamily === "publisher" ? "filled" : "ghost"} color="text" onClick={() => setFontFamily("publisher")}>
              Publisher
            </Button>
            <Button variant={fontFamily === "system" ? "filled" : "ghost"} color="text" onClick={() => setFontFamily("system")}>
              System
            </Button>
            <Button variant={fontFamily === "sans" ? "filled" : "ghost"} color="text" onClick={() => setFontFamily("sans")}>
              Sans
            </Button>
          </Stack>
          <Text variant="text.detail" sx={{ mb: 1 }}>
            Layout
          </Text>
          <Stack spacing={2}>
            <Button variant={pageView === "single" ? "filled" : "ghost"} color="text" onClick={() => setPageView("single")}>
              Single
            </Button>
            <Button variant={pageView === "spread" ? "filled" : "ghost"} color="text" onClick={() => setPageView("spread")}>
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
          aria-label="Previous"
          sx={edgeButtonStyles.left as any}
        />
        <Box
          as="button"
          onClick={() => renditionRef.current?.next?.()}
          aria-label="Next"
          sx={edgeButtonStyles.right as any}
        />

        <Button
          variant="ghost"
          color="text"
          iconLeft={ChevronLeft}
          onClick={() => renditionRef.current?.prev?.()}
          sx={floatingNavStyles.left as any}
        >
          Prev
        </Button>
        <Button
          variant="ghost"
          color="text"
          iconLeft={ChevronRight}
          onClick={() => renditionRef.current?.next?.()}
          sx={floatingNavStyles.right as any}
        >
          Next
        </Button>
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
    </Box>
  );
};

export default EpubReader;

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

const normalize = (value: any): string => {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map(item => String(item ?? "")).filter(Boolean).join(", ");
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

const pushCandidate = (set: Set<string>, value?: string) => {
  if (!value) return;
  const trimmed = value.trim();
  if (trimmed) set.add(trimmed);
};

const buildDisplayCandidates = (target: string, spineItems: any[] = []) => {
  const set = new Set<string>();
  const raw = target.trim();
  const decoded = safeDecode(raw);

  [raw, decoded].forEach(source => {
    pushCandidate(set, source);
    const { path, hash } = splitHref(source);
    if (!path) return;

    const cleaned = cleanPath(path);
    const basename = cleaned.split("/").pop() || "";

    pushCandidate(set, path);
    pushCandidate(set, cleaned);
    pushCandidate(set, `${cleaned}${hash}`);
    pushCandidate(set, basename);
    pushCandidate(set, `${basename}${hash}`);

    try {
      const parsed = new URL(source);
      const parsedPath = cleanPath(parsed.pathname);
      const parsedHash = parsed.hash || hash;
      const parsedBase = parsedPath.split("/").pop() || "";
      pushCandidate(set, parsedPath);
      pushCandidate(set, `${parsedPath}${parsedHash}`);
      pushCandidate(set, parsedBase);
      pushCandidate(set, `${parsedBase}${parsedHash}`);
    } catch {
      // not an absolute URL
    }

    for (const item of spineItems) {
      const spineHref = typeof item?.href === "string" ? item.href : "";
      if (!spineHref) continue;
      const spineClean = cleanPath(spineHref);
      const spineBase = spineClean.split("/").pop() || "";

      if (spineClean === cleaned || spineBase === basename || cleaned.endsWith(spineClean)) {
        pushCandidate(set, spineHref);
        pushCandidate(set, spineClean);
        pushCandidate(set, `${spineHref}${hash}`);
        pushCandidate(set, `${spineClean}${hash}`);
      }
    }
  });

  return Array.from(set);
};

const resolveTocItemPosition = (
  item: any,
  book: any
): { pageNumber?: number; locationIndex?: number } => {
  const locations = book?.locations;
  if (!locations?.locationFromCfi) return {};

  const normalizeLoc = (value: any): number | undefined => {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Math.max(1, Math.round(value));
  };

  const itemCfi = typeof item?.cfi === "string" ? item.cfi : "";
  if (itemCfi) {
    try {
      const fromCfi = locations.locationFromCfi(itemCfi);
      const normalized = normalizeLoc(fromCfi);
      if (normalized) return { pageNumber: normalized, locationIndex: normalized };
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
    if (spineClean === cleaned || spineBase === basename || cleaned.endsWith(spineClean)) {
      const cfiBase = typeof spine?.cfiBase === "string" ? spine.cfiBase : "";
      if (!cfiBase) continue;
      try {
        const fromBase = locations.locationFromCfi(cfiBase);
        const normalized = normalizeLoc(fromBase);
        if (normalized) return { pageNumber: normalized, locationIndex: normalized };
      } catch {
        // ignore cfiBase lookup errors
      }

      // Fallback when cfiBase cannot be converted: use spine order as a location hint.
      return { locationIndex: i + 1 };
    }
  }

  return {};
};

const annotateTocWithLocations = (items: any[] = [], book: any): any[] => {
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

const findTocLabel = (items: any[] = [], href: string): string | undefined => {
  for (const item of items) {
    if (!item) continue;
    if (item.href && href && item.href.split("#")[0] === href.split("#")[0]) {
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
  item: any;
  depth: number;
  onSelect: (href: string) => void;
  activeHref?: string;
}> = ({ item, depth, onSelect, activeHref }) => {
  const [expanded, setExpanded] = React.useState(depth < 1);
  const label = item?.label || item?.title || "Untitled";
  const href = typeof item?.href === "string" ? item.href : "";
  const subitems = Array.isArray(item?.subitems) ? item.subitems : [];
  const hasChildren = subitems.length > 0;
  const pageNumber =
    typeof item?.pageNumber === "number" && Number.isFinite(item.pageNumber)
      ? Math.max(1, Math.round(item.pageNumber))
      : undefined;
  const locationIndex =
    typeof item?.locationIndex === "number" && Number.isFinite(item.locationIndex)
      ? Math.max(1, Math.round(item.locationIndex))
      : undefined;
  const isActive = href && activeHref ? tocHrefMatches(href, activeHref) : false;
  const isHeading = !href && hasChildren;
  const itemFontWeight = isHeading ? 700 : depth > 0 ? 400 : 600;

  return (
    <Box>
      <Box
        as={href ? "button" : "div"}
        onClick={href ? () => onSelect(href) : undefined}
        sx={{
          appearance: "none",
          borderRadius: 8,
          border: "1px solid",
          borderColor: isActive
            ? "var(--reader-chrome-text, #0f172a)"
            : "transparent",
          background: "transparent",
          cursor: href ? "pointer" : "default",
          justifyContent: "space-between",
          display: "flex",
          alignItems: "flex-start",
          gap: 2,
          width: "100%",
          textAlign: "left",
          pl: 2 + depth * 3,
          pr: 2,
          py: 2,
          whiteSpace: "normal",
          minHeight: "unset",
          "&:focus,&:hover": {
            background: href ? "rgba(148, 163, 184, 0.14)" : "transparent",
            textDecoration: "none"
          },
          "&:active": {
            background: href ? "rgba(148, 163, 184, 0.22)" : "transparent"
          }
        }}
      >
        {hasChildren ? (
          <Button
            variant="ghost"
            color="text"
            onClick={event => {
              event.stopPropagation();
              setExpanded(prev => !prev);
            }}
            sx={{ px: 1, py: 0, minHeight: "unset", lineHeight: 1 }}
          >
            {expanded ? "▾" : "▸"}
          </Button>
        ) : (
          <Box as="span" sx={{ width: 16 }} />
        )}
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

      {hasChildren && expanded && (
        <Box>
          {subitems.map((child: any, index: number) => (
            <TocItem
              key={child?.id || child?.href || `${child?.label || child?.title}-${index}`}
              item={child}
              depth={depth + 1}
              onSelect={onSelect}
              activeHref={activeHref}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

const panelStyles = {
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
    top: 64,
    left: 16,
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

const inputStyles = {
  width: "100%",
  border: "1px solid var(--reader-chrome-border, #e2e8f0)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--reader-chrome-text, inherit)",
  background: "transparent"
};

const resultCardStyles = {
  border: "1px solid",
  borderColor: "var(--reader-chrome-border, #e2e8f0)",
  borderRadius: 8,
  p: 2,
  cursor: "pointer"
};

const edgeButtonStyles = {
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

const floatingNavStyles = {
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
