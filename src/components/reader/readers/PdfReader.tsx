import * as React from "react";
import { Box, type ThemeUIStyleObject } from "theme-ui";
import Button from "components/Button";
import Stack from "components/Stack";
import { Text } from "components/Text";
import Info from "icons/Info";
import Trash from "icons/Trash";
import ReaderControls from "../ReaderControls";
import ReaderUtilityControls from "../ReaderUtilityControls";
import { useReaderInfo } from "../ReaderWrapper";
import AnnotationPanel from "../AnnotationPanel";
import ReaderNavigationPanel from "../ReaderNavigationPanel";
import { downloadAnnotationAsRis } from "utils/ris";
import { useAnnotationSync } from "hooks/useAnnotationSync";
import { usePdfDocument } from "hooks/usePdfDocument";
import { usePdfAnnotations } from "hooks/usePdfAnnotations";
import {
  type PdfReaderProps,
  type PdfRenderTask,
  type TextLayerData,
  type PdfSearchResult
} from "./PdfReader.types";
import { PdfNativeFallback } from "./PdfNativeFallback";
import { PdfTextLayer } from "./PdfTextLayer";
import { PdfTocTree } from "./PdfTocTree";

// Style constants
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

const PdfReader: React.FC<PdfReaderProps> = ({
  url,
  authToken,
  title,
  bookUrl,
  coverUrl,
  bookAuthors,
  bookPublisher,
  bookLanguage,
  bookIdentifier,
  setLoading
}) => {
  const bookId = bookIdentifier ?? bookUrl ?? url;
  const annotationSync = useAnnotationSync({
    bookKey: url,
    bookId,
    mediaType: "pdf"
  });

  // Refs for rendering
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const primaryCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const secondaryCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const renderTasksRef = React.useRef<PdfRenderTask[]>([]);

  // Local UI state - declare before hooks that depend on them
  const [error, setError] = React.useState<string | null>(null);
  const [pageNumber, setPageNumber] = React.useState(1);
  const [scale, setScale] = React.useState(1);
  const [containerWidth, setContainerWidth] = React.useState(960);
  const [useCustomPdfRender, setUseCustomPdfRender] = React.useState(true);
  const [tocTab, setTocTab] = React.useState<
    "toc" | "bookmarks" | "annotations"
  >("toc");
  const [tocActive, setTocActive] = React.useState(false);
  const [searchActive, setSearchActive] = React.useState(false);
  const [displayActive, setDisplayActive] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<PdfSearchResult[]>(
    []
  );
  const [isSearching, setIsSearching] = React.useState(false);
  const [pageView, setPageView] = React.useState<"single" | "spread">("single");
  const [primaryTextData, setPrimaryTextData] =
    React.useState<TextLayerData | null>(null);
  const [secondaryTextData, setSecondaryTextData] =
    React.useState<TextLayerData | null>(null);
  const [selectionPopup, setSelectionPopup] = React.useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [pendingCitationText, setPendingCitationText] = React.useState<
    string | null
  >(null);

  // Extracted hooks for PDF document and annotations
  const {
    pdfRef,
    pdfUrl,
    numPages,
    tocItems,
    useNativeFallback,
    error: pdfError
  } = usePdfDocument(url, authToken, setLoading);

  const {
    bookmarks,
    annotations,
    annotationDraft,
    setAnnotationDraft,
    editingAnnotationId,
    editingAnnotationDraft,
    setEditingAnnotationDraft,
    addBookmark: hookAddBookmark,
    removeBookmark: hookRemoveBookmark,
    addAnnotation: hookAddAnnotation,
    removeAnnotation: hookRemoveAnnotation,
    beginAnnotationEdit: hookBeginAnnotationEdit,
    cancelAnnotationEdit: hookCancelAnnotationEdit,
    saveAnnotationEdit: hookSaveAnnotationEdit,
    copyAnnotation: hookCopyAnnotation
  } = usePdfAnnotations(
    url,
    pageNumber,
    numPages,
    title,
    bookUrl,
    annotationSync
  );

  const readerInfo = useReaderInfo();

  // Sync pdfError to local error state
  React.useEffect(() => {
    if (pdfError) {
      setError(pdfError);
    }
  }, [pdfError]);

  // Populate the ReaderWrapper book-info panel with catalog metadata
  React.useEffect(() => {
    if (!readerInfo?.setBookInfo) return;
    readerInfo.setBookInfo({
      title: title || undefined,
      author: bookAuthors || undefined,
      publisher: bookPublisher || undefined,
      language: bookLanguage || undefined,
      identifier: bookIdentifier || undefined,
      coverUrl: coverUrl || undefined
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
    bookAuthors,
    bookPublisher,
    bookLanguage,
    bookIdentifier,
    coverUrl
  ]);

  const _closePanels = () => {
    setTocActive(false);
    setSearchActive(false);
    setDisplayActive(false);
  };

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

  const openTocPanel = () => {
    setTocActive(prev => !prev);
    setSearchActive(false);
    setDisplayActive(false);
  };

  const openSearchPanel = () => {
    setSearchActive(prev => !prev);
    setTocActive(false);
    setDisplayActive(false);
  };

  const openDisplayPanel = () => {
    setDisplayActive(prev => !prev);
    setTocActive(false);
    setSearchActive(false);
  };

  // --- Rendering ---

  React.useEffect(() => {
    if (!containerRef.current) return;

    const measure = () => {
      if (!containerRef.current) return;
      const nextWidth = Math.floor(
        containerRef.current.getBoundingClientRect().width
      );
      if (nextWidth > 0) setContainerWidth(nextWidth);
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (pageView === "spread") {
      setPageNumber(prev => (prev % 2 === 0 ? Math.max(1, prev - 1) : prev));
    }
  }, [pageView]);

  // Render the current page(s) onto canvas(es).  Spread view renders two
  // pages side-by-side using primary and secondary canvases.  After the render
  // tasks complete, text content is fetched so PdfTextLayer can overlay a
  // transparent, selectable surface for copy/citation without the PDF needing
  // to be a tagged or searchable PDF.
  React.useEffect(() => {
    const renderPages = async () => {
      const pdf = pdfRef.current;
      const primaryCanvas = primaryCanvasRef.current;
      const secondaryCanvas = secondaryCanvasRef.current;
      if (
        !pdf ||
        !primaryCanvas ||
        !numPages ||
        useNativeFallback ||
        !useCustomPdfRender
      )
        return;

      setPrimaryTextData(null);
      setSecondaryTextData(null);

      try {
        const requestedPages =
          pageView === "spread"
            ? [pageNumber, pageNumber + 1 <= numPages ? pageNumber + 1 : null]
            : [pageNumber, null];

        const pages = await Promise.all(
          requestedPages.map(pageNo =>
            pageNo ? pdf.getPage(pageNo) : Promise.resolve(null)
          )
        );

        renderTasksRef.current.forEach(task => task?.cancel?.());
        renderTasksRef.current = [];

        const canvases = [primaryCanvas, secondaryCanvas || null];
        const perPageAvailableWidth =
          pageView === "spread"
            ? Math.max(220, (containerWidth - 96) / 2)
            : Math.max(220, containerWidth - 48);

        const tasks: PdfRenderTask[] = [];
        const computedScales: {
          viewportTransform: number[];
        }[] = [];

        for (let i = 0; i < canvases.length; i += 1) {
          const canvas = canvases[i];
          const page = pages[i];
          if (!canvas) continue;

          if (!page) {
            canvas.width = 0;
            canvas.height = 0;
            canvas.style.width = "0px";
            canvas.style.height = "0px";
            continue;
          }

          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Canvas context unavailable");
          }

          const baseViewport = page.getViewport({ scale: 1 });
          const widthScale = Math.max(
            0.25,
            perPageAvailableWidth / baseViewport.width
          );
          const finalScale = widthScale * scale;
          const viewport = page.getViewport({ scale: finalScale });

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          computedScales[i] = {
            viewportTransform: viewport.transform
          };

          const task = page.render({ canvasContext: context, viewport });
          tasks.push(task);
        }

        renderTasksRef.current = tasks;
        await Promise.all(tasks.map(task => task.promise));

        // Fetch text content for text-selection overlay
        const textDataList: (TextLayerData | null)[] = [null, null];
        for (let i = 0; i < canvases.length; i += 1) {
          const page = pages[i];
          const canvas = canvases[i];
          const scaleInfo = computedScales[i];
          if (!page || !canvas || !scaleInfo || canvas.width === 0) continue;
          try {
            const textContent = await page.getTextContent?.();
            if (textContent?.items?.length) {
              textDataList[i] = {
                items: textContent.items,
                viewportTransform: scaleInfo.viewportTransform,
                canvasWidth: canvas.width,
                canvasHeight: canvas.height
              };
            }
          } catch {
            // text content unavailable for this page
          }
        }
        setPrimaryTextData(textDataList[0] ?? null);
        setSecondaryTextData(textDataList[1] ?? null);

        setLoading(false);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown render error";
        if (!message.toLowerCase().includes("renderingcancelledexception")) {
          console.warn(
            "Custom PDF render failed, using native fallback:",
            message
          );
          setUseCustomPdfRender(false);
          setLoading(false);
        }
      }
    };

    void renderPages();
  }, [
    pageNumber,
    numPages,
    scale,
    containerWidth,
    pageView,
    useNativeFallback,
    useCustomPdfRender,
    pdfRef,
    setLoading
  ]);

  const pageStep = pageView === "spread" ? 2 : 1;
  const goPrev = () => setPageNumber(prev => Math.max(1, prev - pageStep));
  const goNext = () =>
    setPageNumber(prev =>
      numPages ? Math.min(numPages, prev + pageStep) : prev + pageStep
    );

  const zoomOut = () => setScale(prev => Math.max(0.6, prev - 0.1));
  const zoomIn = () => setScale(prev => Math.min(2, prev + 0.1));
  const activeBookmark = bookmarks.find(entry => entry.pageNumber === pageNumber);

  // UI adapters for annotation handlers
  const addBookmark = () => {
    hookAddBookmark();
    setTocActive(true);
    setTocTab("bookmarks");
  };

  const toggleBookmark = () => {
    if (activeBookmark) {
      hookRemoveBookmark(activeBookmark.id);
      return;
    }
    addBookmark();
  };

  const removeBookmark = (id: string) => {
    hookRemoveBookmark(id);
  };

  const addAnnotation = () => {
    hookAddAnnotation();
    setPendingCitationText(null);
  };

  const removeAnnotation = (id: string) => {
    hookRemoveAnnotation(id);
  };

  const beginAnnotationEdit = (annotation: any) => {
    hookBeginAnnotationEdit(annotation);
  };

  const cancelAnnotationEdit = () => {
    hookCancelAnnotationEdit();
  };

  const saveAnnotationEdit = () => {
    hookSaveAnnotationEdit();
  };

  const copyAnnotation = (annotation: any) => {
    hookCopyAnnotation(annotation);
  };

  // --- PDF full-text search ---
  // Iterates every page via pdfjs getTextContent(), concatenates extracted
  // text items, and collects ±40-character excerpts for every match.
  const runSearch = async () => {
    if (!searchQuery.trim() || !pdfRef.current || isSearching) return;
    const query = searchQuery.trim().toLowerCase();
    setIsSearching(true);
    setSearchResults([]);
    try {
      const pdf = pdfRef.current;
      const results: PdfSearchResult[] = [];
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
        const page = await pdf.getPage(pageNo);
        if (!page.getTextContent) continue;
        try {
          const textContent = await page.getTextContent();
          const text = textContent.items.map(item => item.str).join(" ");
          const lower = text.toLowerCase();
          let pos = 0;
          while ((pos = lower.indexOf(query, pos)) !== -1) {
            const start = Math.max(0, pos - 40);
            const end = Math.min(text.length, pos + query.length + 40);
            const excerpt =
              (start > 0 ? "\u2026" : "") +
              text.slice(start, end) +
              (end < text.length ? "\u2026" : "");
            results.push({ pageNumber: pageNo, excerpt });
            pos += query.length;
            // Cap at 3 results per page so the list stays scannable
            if (results.filter(r => r.pageNumber === pageNo).length >= 3) break;
          }
          // Stop after 200 total results to avoid flooding the panel
          if (results.length >= 200) break;
        } catch {
          // text content unavailable for this page
        }
      }
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleTextLayerMouseUp = React.useCallback(
    (event: React.MouseEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectionPopup(null);
        return;
      }
      const text = selection.toString().trim();
      if (!text) {
        setSelectionPopup(null);
        return;
      }
      setSelectionPopup({ text, x: event.clientX, y: event.clientY });
    },
    []
  );

  const lastVisiblePage =
    pageView === "spread" ? Math.min(numPages, pageNumber + 1) : pageNumber;
  const progressLabel =
    numPages > 0
      ? pageView === "spread"
        ? `Pages ${pageNumber}-${lastVisiblePage} of ${numPages}`
        : `Page ${pageNumber} of ${numPages}`
      : "Loading pages...";

  if ((useNativeFallback || !useCustomPdfRender) && pdfUrl) {
    return (
      <PdfNativeFallback
        title={title || ""}
        pdfUrl={pdfUrl}
        nativeViewerSrc={
          pdfUrl
            ? `${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&pagemode=none&view=FitH`
            : ""
        }
        tocActive={tocActive}
        searchActive={searchActive}
        displayActive={displayActive}
        setTocActive={setTocActive}
        setSearchActive={setSearchActive}
        setDisplayActive={setDisplayActive}
        leftControls={leftControls}
      />
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Text sx={{ color: "ui.error" }}>{error}</Text>
      </Box>
    );
  }

  if (!pdfUrl) {
    return (
      <Box sx={{ p: 4 }}>
        <Text>Preparing PDF...</Text>
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
        flexDirection: "column"
      }}
    >
      <ReaderControls
        title={title || ""}
        centerTitle
        onPrev={goPrev}
        onNext={goNext}
        canPrev={pageNumber > 1}
        canNext={numPages ? pageNumber < numPages : true}
        hideNavControls
        hideAdjustControls
        leftControls={leftControls}
        extraControls={
          <ReaderUtilityControls
            onToggleToc={openTocPanel}
            onToggleSearch={openSearchPanel}
            onToggleTheme={openDisplayPanel}
            onAddBookmark={toggleBookmark}
            bookmarkActive={Boolean(activeBookmark)}
            tocActive={tocActive}
            searchActive={searchActive}
            displayActive={displayActive}
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
                  | { pageNumber: number }
                  | null
                  | undefined;
                if (pos?.pageNumber) setPageNumber(pos.pageNumber);
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

      {tocActive && (
        <ReaderNavigationPanel
              storageKey="pdf"
              activeTab={tocTab}
              onTabChange={setTocTab}
              initialWidth={360}
              minWidth={320}
              maxWidth={720}
              top={68}
              right={16}
              zIndex={21}
              panelSx={{ p: 3 }}
              tocContent={
                tocItems.length > 0 ? (
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      overflowY: "auto",
                      flex: 1,
                      minHeight: 0
                    }}
                  >
                    <PdfTocTree
                      items={tocItems}
                      activePage={pageNumber}
                      onSelectPage={nextPage => {
                        if (!nextPage) return;
                        const alignedPage =
                          pageView === "spread" && nextPage % 2 === 0
                            ? Math.max(1, nextPage - 1)
                            : nextPage;
                        setPageNumber(alignedPage);
                        setTocActive(false);
                      }}
                    />
                  </Box>
                ) : (
                  <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
                    No PDF outline detected. This file may not include
                    structured TOC entries.
                  </Text>
                )
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
                  <Button variant="ghost" color="text" onClick={addBookmark}>
                    Bookmark current page
                  </Button>
                  {bookmarks.length > 0 ? (
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
                      {bookmarks
                        .slice()
                        .sort((a, b) => a.pageNumber - b.pageNumber)
                        .map(bookmark => (
                          <Box
                            key={bookmark.id}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 2,
                              border: "1px solid",
                              borderColor:
                                "var(--reader-chrome-border, #e2e8f0)",
                              borderRadius: 8,
                              p: 2
                            }}
                          >
                            <Button
                              variant="ghost"
                              color="text"
                              sx={{
                                justifyContent: "flex-start",
                                px: 0,
                                py: 0,
                                minHeight: "unset"
                              }}
                              onClick={() => {
                                const alignedPage =
                                  pageView === "spread" &&
                                  bookmark.pageNumber % 2 === 0
                                    ? Math.max(1, bookmark.pageNumber - 1)
                                    : bookmark.pageNumber;
                                setPageNumber(alignedPage);
                                setTocActive(false);
                              }}
                            >
                              Page {bookmark.pageNumber}
                            </Button>
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
                    <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
                      No bookmarks yet.
                    </Text>
                  )}
                </Box>
              }
              annotationsContent={
                <AnnotationPanel
                  pendingAnnotationText={pendingCitationText}
                  annotationDraft={annotationDraft}
                  onAnnotationDraftChange={setAnnotationDraft}
                  onRemovePendingAnnotationText={() => setPendingCitationText(null)}
                  onAddAnnotation={addAnnotation}
                  annotations={annotations
                    .slice()
                    .sort((a, b) => a.pageNumber - b.pageNumber)
                    .map(annotation => ({
                      id: annotation.id,
                      note: annotation.note,
                      quotedText: annotation.quotedText,
                      pageNumber: annotation.pageNumber
                    }))}
                  editingAnnotationId={editingAnnotationId}
                  editingAnnotationDraft={editingAnnotationDraft}
                  onEditingAnnotationDraftChange={setEditingAnnotationDraft}
                  onBeginEdit={annotation => {
                    const ann = annotations.find(a => a.id === annotation.id);
                    if (ann) beginAnnotationEdit(ann);
                  }}
                  onSaveEdit={saveAnnotationEdit}
                  onCancelEdit={cancelAnnotationEdit}
                  onDelete={removeAnnotation}
                  onCopy={annotation => {
                    const ann = annotations.find(a => a.id === annotation.id);
                    if (ann) copyAnnotation(ann);
                  }}
                  onDownload={annotation => {
                    const ann = annotations.find(a => a.id === annotation.id);
                    if (!ann) return;

                    downloadAnnotationAsRis(ann, {
                      title,
                      author: bookAuthors,
                      publisher: bookPublisher,
                      url: bookUrl || url,
                      referenceType: "EBOOK"
                    });
                  }}
                  onNavigate={annotation => {
                    const alignedPage =
                      pageView === "spread" && annotation.pageNumber! % 2 === 0
                        ? Math.max(1, annotation.pageNumber! - 1)
                        : annotation.pageNumber;
                    setPageNumber(alignedPage!);
                    setTocActive(false);
                  }}
                  saveButtonLabel="Save note"
                  draftPlaceholder="Type a note"
                  citationBookTitle={title}
                  citationAuthor={bookAuthors}
                  citationPublisher={bookPublisher}
                />
              }
            />
      )}

      {(searchActive || displayActive) && (
        <Box
          sx={{
            position: "absolute",
            top: 68,
            right: 16,
            zIndex: 20,
            width: "min(360px, calc(100vw - 32px))",
            maxHeight: "70vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "var(--reader-chrome-bg, #ffffff)",
            border: "1px solid",
            borderColor: "var(--reader-chrome-border, #e2e8f0)",
            borderRadius: 10,
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
            p: 3
          }}
        >

          {searchActive && (
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
              <Box
                sx={{
                  display: "flex",
                  gap: 2,
                  flexShrink: 0,
                  "& .pdf-search-input": {
                    flex: 1,
                    border: "1px solid",
                    borderColor: "var(--reader-chrome-border, #e2e8f0)",
                    borderRadius: 8,
                    px: 2,
                    py: "6px",
                    fontSize: 14,
                    background: "transparent",
                    color: "var(--reader-chrome-text, inherit)",
                    outline: "none"
                  }
                }}
              >
                <input
                  className="pdf-search-input"
                  type="search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") void runSearch();
                  }}
                  placeholder="Search in book"
                  aria-label="Search in book"
                />
                <Button
                  variant="ghost"
                  color="text"
                  onClick={() => void runSearch()}
                  disabled={isSearching || !searchQuery.trim()}
                >
                  {isSearching ? "Searching\u2026" : "Search"}
                </Button>
              </Box>
              <Box sx={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                {searchResults.length > 0 ? (
                  <Box
                    sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                  >
                    {searchResults.map((result, index) => (
                      <Box
                        key={`${result.pageNumber}-${index}`}
                        role="button"
                        tabIndex={0}
                        sx={{
                          p: 2,
                          border: "1px solid",
                          borderColor: "var(--reader-chrome-border, #e2e8f0)",
                          borderRadius: 8,
                          cursor: "pointer",
                          "&:hover": { background: "rgba(0,0,0,0.04)" },
                          "&:focus-visible": {
                            outline: "2px solid",
                            outlineColor: "brand.primary"
                          }
                        }}
                        onClick={() => {
                          const alignedPage =
                            pageView === "spread" && result.pageNumber % 2 === 0
                              ? Math.max(1, result.pageNumber - 1)
                              : result.pageNumber;
                          setPageNumber(alignedPage);
                          setSearchActive(false);
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            const alignedPage =
                              pageView === "spread" &&
                              result.pageNumber % 2 === 0
                                ? Math.max(1, result.pageNumber - 1)
                                : result.pageNumber;
                            setPageNumber(alignedPage);
                            setSearchActive(false);
                          }
                        }}
                      >
                        <Text
                          variant="text.detail"
                          sx={{ color: "ui.gray.dark", mb: 1 }}
                        >
                          Page {result.pageNumber}
                        </Text>
                        <Text variant="text.body.regular">
                          {result.excerpt}
                        </Text>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
                    {isSearching
                      ? "Searching\u2026"
                      : searchQuery.trim()
                        ? "No results found."
                        : "Enter a search term above."}
                  </Text>
                )}
              </Box>
            </Box>
          )}

          {displayActive && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 3,
                flex: 1,
                overflowY: "auto",
                minHeight: 0
              }}
            >
              <Text variant="text.headers.primary">Display</Text>
              <Box>
                <Text
                  variant="text.detail"
                  sx={{ color: "ui.gray.dark", mb: 2 }}
                >
                  Text / Zoom Size
                </Text>
                <Stack spacing={2} sx={{ flexWrap: "wrap" }}>
                  <Button variant="ghost" color="text" onClick={zoomOut}>
                    A-
                  </Button>
                  <Button variant="ghost" color="text" onClick={zoomIn}>
                    A+
                  </Button>
                </Stack>
              </Box>
              <Box>
                <Text
                  variant="text.detail"
                  sx={{ color: "ui.gray.dark", mb: 2 }}
                >
                  Page Spread
                </Text>
                <Stack spacing={2} sx={{ flexWrap: "wrap" }}>
                  <Button
                    variant={pageView === "single" ? "filled" : "ghost"}
                    color="text"
                    onClick={() => setPageView("single")}
                  >
                    Single Page
                  </Button>
                  <Button
                    variant={pageView === "spread" ? "filled" : "ghost"}
                    color="text"
                    onClick={() => setPageView("spread")}
                  >
                    Two-Page Spread
                  </Button>
                </Stack>
              </Box>
            </Box>
          )}
        </Box>
      )}

      <Box sx={{ position: "relative", flex: 1, minHeight: "70vh" }}>
        <Box
          ref={containerRef}
          sx={{
            height: "100%",
            overflow: "auto",
            p: 3,
            display: "flex",
            justifyContent: "center",
            background:
              "linear-gradient(180deg, rgba(241,245,249,0.96) 0%, rgba(226,232,240,0.9) 100%)"
          }}
        >
          <Box sx={{ display: "flex", gap: 3, alignItems: "flex-start" }}>
            <Box
              sx={{
                position: "relative",
                lineHeight: 0,
                display: "inline-block",
                "& canvas": { display: "block" }
              }}
            >
              <canvas ref={primaryCanvasRef} />
              {primaryTextData && (
                <PdfTextLayer
                  data={primaryTextData}
                  onMouseDown={() => setSelectionPopup(null)}
                  onMouseUp={handleTextLayerMouseUp}
                />
              )}
            </Box>
            {pageView === "spread" && (
              <Box
                sx={{
                  position: "relative",
                  lineHeight: 0,
                  display: "inline-block",
                  "& canvas": { display: "block" }
                }}
              >
                <canvas ref={secondaryCanvasRef} />
                {secondaryTextData && (
                  <PdfTextLayer
                    data={secondaryTextData}
                    onMouseDown={() => setSelectionPopup(null)}
                    onMouseUp={handleTextLayerMouseUp}
                  />
                )}
              </Box>
            )}
          </Box>
        </Box>

        <Box
          onClick={goPrev}
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "15%",
            maxWidth: 120,
            cursor: "pointer",
            zIndex: 5,
            background: "transparent"
          }}
          aria-label="Previous page"
        />
        <Box
          onClick={goNext}
          sx={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: "15%",
            maxWidth: 120,
            cursor: "pointer",
            zIndex: 5,
            background: "transparent"
          }}
          aria-label="Next page"
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
          {progressLabel}
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
            gap: 0,
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
              setAnnotationDraft("");
              setTocActive(true);
              setTocTab("annotations");
              setSearchActive(false);
              setDisplayActive(false);
              setSelectionPopup(null);
              window.getSelection()?.removeAllRanges();
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
            onClick={() => {
              setSelectionPopup(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            ✕
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default PdfReader;
