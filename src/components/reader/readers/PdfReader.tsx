import * as React from "react";
import { Box, type ThemeUIStyleObject } from "theme-ui";
import Button, { AnchorButton } from "components/Button";
import Stack from "components/Stack";
import { Text } from "components/Text";
import Info from "icons/Info";
import Trash from "icons/Trash";
import ReaderControls from "../ReaderControls";
import ReaderUtilityControls from "../ReaderUtilityControls";
import { useReaderInfo } from "../ReaderWrapper";
import { getProxiedUrl } from "utils/proxyUrl";
import { toBrowserFetchUrl } from "utils/localCmProxy";

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (source: { url: string } | { data: Uint8Array }) => {
    promise: Promise<PdfDocument>;
  };
};

type PdfViewport = {
  width: number;
  height: number;
  transform: number[];
};

type PdfRenderTask = {
  promise: Promise<void>;
  cancel?: () => void;
};

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

type PdfTextContent = {
  items: PdfTextItem[];
};

type TextLayerData = {
  items: PdfTextItem[];
  viewportTransform: number[];
  canvasWidth: number;
  canvasHeight: number;
};

type PdfPage = {
  getViewport: (args: { scale: number }) => PdfViewport;
  render: (args: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => PdfRenderTask;
  getTextContent?: () => Promise<PdfTextContent>;
};

type PdfDestinationRef = unknown;

type PdfExplicitDestination = [PdfDestinationRef, ...unknown[]];

type PdfOutlineNode = {
  title?: string;
  dest?: string | PdfExplicitDestination | null;
  items?: PdfOutlineNode[];
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  getOutline?: () => Promise<PdfOutlineNode[] | null>;
  getDestination?: (name: string) => Promise<PdfExplicitDestination | null>;
  getPageIndex?: (ref: PdfDestinationRef) => Promise<number>;
  destroy?: () => Promise<void>;
};

type PdfTocItem = {
  title: string;
  pageNumber?: number;
  children: PdfTocItem[];
};

type PdfBookmarkItem = {
  id: string;
  pageNumber: number;
  createdAt: number;
};

type PdfAnnotationItem = {
  id: string;
  pageNumber: number;
  note: string;
  quotedText?: string;
  createdAt: number;
};

type PdfReaderProps = {
  url: string;
  authToken?: string;
  title?: string;
  bookUrl?: string;
  coverUrl?: string;
  bookAuthors?: string;
  bookPublisher?: string;
  bookLanguage?: string;
  bookIdentifier?: string;
  setLoading: (value: boolean) => void;
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
  const objectUrlRef = React.useRef<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const primaryCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const secondaryCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const pdfRef = React.useRef<PdfDocument | null>(null);
  const renderTasksRef = React.useRef<PdfRenderTask[]>([]);

  const [error, setError] = React.useState<string | null>(null);
  const [pdfData, setPdfData] = React.useState<Uint8Array | null>(null);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [numPages, setNumPages] = React.useState(0);
  const [pageNumber, setPageNumber] = React.useState(1);
  const [scale, setScale] = React.useState(1);
  const [containerWidth, setContainerWidth] = React.useState(960);
  const [useNativeFallback, setUseNativeFallback] = React.useState(false);
  const [tocItems, setTocItems] = React.useState<PdfTocItem[]>([]);
  const [tocTab, setTocTab] = React.useState<
    "toc" | "bookmarks" | "annotations"
  >("toc");
  const [bookmarks, setBookmarks] = React.useState<PdfBookmarkItem[]>([]);
  const [annotations, setAnnotations] = React.useState<PdfAnnotationItem[]>([]);
  const [annotationDraft, setAnnotationDraft] = React.useState("");
  const [editingAnnotationId, setEditingAnnotationId] = React.useState<
    string | null
  >(null);
  const [editingAnnotationDraft, setEditingAnnotationDraft] =
    React.useState("");

  const [tocActive, setTocActive] = React.useState(false);
  const [searchActive, setSearchActive] = React.useState(false);
  const [displayActive, setDisplayActive] = React.useState(false);
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

  const readerInfo = useReaderInfo();

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

  const closePanels = () => {
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

  React.useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      setPdfData(null);
      setPdfUrl(null);
      setNumPages(0);
      setPageNumber(1);
      setUseNativeFallback(false);
      setTocItems([]);
      setTocTab("toc");
      setScale(1);
      setPageView("single");
      setTocActive(false);
      setSearchActive(false);
      setDisplayActive(false);

      try {
        const proxied = toBrowserFetchUrl(url);
        const isLocalCm = proxied !== url;
        const fetchUrl = isLocalCm ? proxied : getProxiedUrl(url);
        const fetchHeaders: Record<string, string> = {};
        if (authToken) {
          const headerKey = isLocalCm
            ? "Authorization"
            : "X-Reader-Authorization";
          fetchHeaders[headerKey] = authToken;
        }
        const response = await fetch(fetchUrl, {
          headers: Object.keys(fetchHeaders).length ? fetchHeaders : undefined
        });
        if (!response.ok) {
          throw new Error(`Failed to load PDF (${response.status})`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const blob = new Blob([bytes], { type: "application/pdf" });
        const blobUrl = URL.createObjectURL(blob);
        objectUrlRef.current = blobUrl;
        if (!active) return;
        setPdfData(bytes);
        setPdfUrl(blobUrl);
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Failed to load PDF.";
        setError(`PDF error: ${message}`);
        setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [url, authToken, setLoading]);

  React.useEffect(() => {
    try {
      const rawBookmarks = localStorage.getItem(`reader:pdf:bookmarks:${url}`);
      const rawAnnotations = localStorage.getItem(
        `reader:pdf:annotations:${url}`
      );
      setBookmarks(rawBookmarks ? JSON.parse(rawBookmarks) : []);
      setAnnotations(rawAnnotations ? JSON.parse(rawAnnotations) : []);
    } catch {
      setBookmarks([]);
      setAnnotations([]);
    }
    setAnnotationDraft("");
    setEditingAnnotationId(null);
    setEditingAnnotationDraft("");
  }, [url]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        `reader:pdf:bookmarks:${url}`,
        JSON.stringify(bookmarks)
      );
    } catch {
      // ignore storage errors
    }
  }, [bookmarks, url]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        `reader:pdf:annotations:${url}`,
        JSON.stringify(annotations)
      );
    } catch {
      // ignore storage errors
    }
  }, [annotations, url]);

  React.useEffect(() => {
    if (!pdfData) return;

    let active = true;

    const initPdf = async () => {
      try {
        const pdfModuleUrl = "/pdf.min.mjs";
        const pdfjs = (await import(
          /* webpackIgnore: true */ pdfModuleUrl
        )) as PdfJsModule;
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        if (!active) return;

        const loadingTask = pdfjs.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;
        if (!active) {
          await pdf.destroy?.();
          return;
        }

        pdfRef.current = pdf;
        setNumPages(pdf.numPages || 0);
        setPageNumber(1);

        const resolveDestToPage = async (dest: unknown) => {
          if (!pdf.getPageIndex) return undefined;

          let explicitDest: PdfExplicitDestination | null = null;
          if (Array.isArray(dest)) {
            explicitDest = dest as PdfExplicitDestination;
          } else if (typeof dest === "string" && pdf.getDestination) {
            explicitDest = await pdf.getDestination(dest);
          }

          if (!explicitDest || !explicitDest.length) return undefined;
          const destRef = explicitDest[0];
          if (!destRef) return undefined;

          try {
            const pageIdx = await pdf.getPageIndex(destRef);
            return Number.isFinite(pageIdx) ? pageIdx + 1 : undefined;
          } catch {
            return undefined;
          }
        };

        const normalizeOutline = async (
          items: PdfOutlineNode[] | null
        ): Promise<PdfTocItem[]> => {
          if (!items?.length) return [];

          const normalized = await Promise.all(
            items.map(async item => {
              const titleText = String(item?.title || "").trim() || "Untitled";
              const page = await resolveDestToPage(item?.dest);
              const children = await normalizeOutline(item?.items || null);
              return {
                title: titleText,
                pageNumber: page,
                children
              } as PdfTocItem;
            })
          );

          return normalized;
        };

        const rawOutline = (await pdf.getOutline?.()) || null;
        const parsedOutline = await normalizeOutline(rawOutline);
        setTocItems(parsedOutline);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown PDF init error";
        console.warn(
          "Custom PDF renderer failed, using native fallback:",
          message
        );
        setUseNativeFallback(true);
        setLoading(false);
      }
    };

    initPdf();

    return () => {
      active = false;
      renderTasksRef.current.forEach(task => task?.cancel?.());
      renderTasksRef.current = [];
      if (pdfRef.current?.destroy) {
        void pdfRef.current.destroy();
      }
      pdfRef.current = null;
    };
  }, [pdfData, setLoading]);

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

  React.useEffect(() => {
    const renderPages = async () => {
      const pdf = pdfRef.current;
      const primaryCanvas = primaryCanvasRef.current;
      const secondaryCanvas = secondaryCanvasRef.current;
      if (!pdf || !primaryCanvas || !numPages || useNativeFallback) return;

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
          setUseNativeFallback(true);
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
  const createId = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const addBookmark = () => {
    if (bookmarks.some(entry => entry.pageNumber === pageNumber)) return;
    setBookmarks(prev => [
      ...prev,
      { id: createId(), pageNumber, createdAt: Date.now() }
    ]);
    setTocActive(true);
    setTocTab("bookmarks");
  };

  const beginAnnotationEdit = (annotation: PdfAnnotationItem) => {
    setEditingAnnotationId(annotation.id);
    setEditingAnnotationDraft(annotation.note);
  };

  const cancelAnnotationEdit = () => {
    setEditingAnnotationId(null);
    setEditingAnnotationDraft("");
  };

  const saveAnnotationEdit = () => {
    const note = editingAnnotationDraft.trim();
    if (!editingAnnotationId || !note) return;
    setAnnotations(prev =>
      prev.map(annotation =>
        annotation.id === editingAnnotationId
          ? {
              ...annotation,
              note
            }
          : annotation
      )
    );
    setEditingAnnotationId(null);
    setEditingAnnotationDraft("");
  };

  const removeAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(entry => entry.id !== id));
    if (editingAnnotationId === id) {
      setEditingAnnotationId(null);
      setEditingAnnotationDraft("");
    }
  };

  const copyAnnotation = async (annotation: PdfAnnotationItem) => {
    const header = [title, `(Page ${annotation.pageNumber})`]
      .filter(Boolean)
      .join(" ");
    const parts: string[] = [];
    if (header) parts.push(header);
    if (annotation.quotedText) parts.push(`"${annotation.quotedText}"`);
    if (annotation.note) parts.push(annotation.note);
    parts.push(bookUrl ?? url);
    const payload = parts.join("\n");
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // ignore clipboard errors
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

  const nativeViewerSrc = pdfUrl
    ? `${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&pagemode=none&view=FitH`
    : null;

  const lastVisiblePage =
    pageView === "spread" ? Math.min(numPages, pageNumber + 1) : pageNumber;
  const progressLabel =
    numPages > 0
      ? pageView === "spread"
        ? `Pages ${pageNumber}-${lastVisiblePage} of ${numPages}`
        : `Page ${pageNumber} of ${numPages}`
      : "Loading pages...";

  if (useNativeFallback && pdfUrl) {
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
          canPrev={false}
          canNext={false}
          canAdjust={false}
          hideNavControls
          hideAdjustControls
          leftControls={leftControls}
          extraControls={
            <ReaderUtilityControls
              onToggleToc={() => setTocActive(prev => !prev)}
              onToggleSearch={() => setSearchActive(prev => !prev)}
              onToggleTheme={() => setDisplayActive(prev => !prev)}
              disableBookmark
              tocActive={tocActive}
              searchActive={searchActive}
              displayActive={displayActive}
            />
          }
        />
        <Box
          sx={{
            flex: 1,
            minHeight: "70vh",
            overflow: "hidden",
            px: { _: 2, md: 3 },
            py: 3,
            background:
              "linear-gradient(180deg, rgba(241,245,249,0.96) 0%, rgba(226,232,240,0.9) 100%)"
          }}
        >
          <Box
            sx={{
              maxWidth: 1200,
              mx: "auto",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 3
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 3,
                px: 3,
                py: 3,
                borderRadius: 14,
                border: "1px solid rgba(148, 163, 184, 0.28)",
                background: "rgba(255,255,255,0.82)",
                boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)"
              }}
            >
              <Box>
                <Text variant="text.headers.primary">PDF Reader</Text>
                <Text
                  variant="text.detail"
                  sx={{ color: "ui.gray.dark", mt: 1 }}
                >
                  This title is using compatibility mode because custom canvas
                  rendering is unavailable in this browser/runtime.
                </Text>
              </Box>
              <Stack spacing={2} sx={{ flexWrap: "wrap" }}>
                <AnchorButton
                  href={pdfUrl || undefined}
                  newTab
                  variant="ghost"
                  color="text"
                >
                  Open in New Tab
                </AnchorButton>
                <AnchorButton
                  href={pdfUrl || undefined}
                  download={title ? `${title}.pdf` : "book.pdf"}
                  variant="filled"
                  color="brand.primary"
                >
                  Download PDF
                </AnchorButton>
              </Stack>
            </Box>
            <Box
              sx={{
                flex: 1,
                minHeight: "64vh",
                borderRadius: 18,
                overflow: "hidden",
                border: "1px solid rgba(15, 23, 42, 0.08)",
                background: "#cbd5e1",
                boxShadow: "0 18px 40px rgba(15, 23, 42, 0.16)",
                position: "relative"
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(circle at top, rgba(255,255,255,0.35), transparent 48%)",
                  pointerEvents: "none",
                  zIndex: 1
                }}
              />
              <iframe
                src={nativeViewerSrc || undefined}
                title={title || "PDF reader"}
                width="100%"
                height="100%"
                frameBorder={0}
              />
            </Box>
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 2,
                px: 3,
                py: 2,
                borderRadius: 12,
                background: "rgba(255,255,255,0.74)",
                border: "1px solid rgba(148, 163, 184, 0.22)"
              }}
            >
              <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
                Patron Web provides styled reader chrome while this
                compatibility mode delegates rendering to the browser PDF
                surface.
              </Text>
              <Button
                variant="ghost"
                color="text"
                onClick={() =>
                  window.open(
                    pdfUrl || undefined,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
              >
                Pop Out Reader
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
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
            onAddBookmark={addBookmark}
            tocActive={tocActive}
            searchActive={searchActive}
            displayActive={displayActive}
          />
        }
      />

      {(tocActive || searchActive || displayActive) && (
        <Box
          sx={{
            position: "absolute",
            top: 68,
            right: 16,
            zIndex: 20,
            width: "min(360px, calc(100vw - 32px))",
            maxHeight: "70vh",
            overflowY: "auto",
            background: "var(--reader-chrome-bg, #ffffff)",
            border: "1px solid",
            borderColor: "var(--reader-chrome-border, #e2e8f0)",
            borderRadius: 10,
            boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
            p: 3
          }}
        >
          {tocActive && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Box sx={{ display: "flex", gap: 2, mb: 1 }}>
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
                <>
                  {tocItems.length > 0 ? (
                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 1 }}
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
                  )}
                </>
              )}

              {tocTab === "bookmarks" && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
                        maxHeight: "52vh",
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
                              onClick={() =>
                                setBookmarks(prev =>
                                  prev.filter(entry => entry.id !== bookmark.id)
                                )
                              }
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
              )}

              {tocTab === "annotations" && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    "& .pdf-annotation-input": { width: "100%", minHeight: 84 }
                  }}
                >
                  {pendingCitationText && (
                    <Box
                      sx={{
                        borderLeft: "3px solid",
                        borderColor: "ui.gray.medium",
                        pl: 2,
                        py: 1,
                        background: "rgba(0,0,0,0.03)",
                        borderRadius: "0 4px 4px 0"
                      }}
                    >
                      <Text
                        variant="text.detail"
                        sx={{ color: "ui.gray.dark", mb: 1 }}
                      >
                        Selected text:
                      </Text>
                      <Text
                        variant="text.detail"
                        sx={{ fontStyle: "italic", mb: 1 }}
                      >
                        &ldquo;{pendingCitationText}&rdquo;
                      </Text>
                      <Button
                        variant="ghost"
                        color="text"
                        onClick={() => setPendingCitationText(null)}
                      >
                        Remove
                      </Button>
                    </Box>
                  )}
                  <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
                    {pendingCitationText
                      ? "Add an optional note"
                      : "Add a note for this page"}
                  </Text>
                  <textarea
                    className="pdf-annotation-input"
                    value={annotationDraft}
                    onChange={event => setAnnotationDraft(event.target.value)}
                    placeholder={
                      pendingCitationText ? "Optional note..." : "Type a note"
                    }
                  />
                  <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
                    <Button
                      variant="ghost"
                      color="text"
                      onClick={() => {
                        const note = annotationDraft.trim();
                        if (!note && !pendingCitationText) return;
                        setAnnotations(prev => [
                          ...prev,
                          {
                            id: createId(),
                            pageNumber,
                            note,
                            quotedText: pendingCitationText ?? undefined,
                            createdAt: Date.now()
                          }
                        ]);
                        setAnnotationDraft("");
                        setPendingCitationText(null);
                      }}
                    >
                      {pendingCitationText ? "Save citation" : "Save note"}
                    </Button>
                  </Box>
                  {annotations.length > 0 ? (
                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                    >
                      {annotations
                        .slice()
                        .sort((a, b) => a.pageNumber - b.pageNumber)
                        .map(annotation => (
                          <Box
                            key={annotation.id}
                            sx={{
                              border: "1px solid",
                              borderColor:
                                "var(--reader-chrome-border, #e2e8f0)",
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
                                onClick={() => {
                                  const alignedPage =
                                    pageView === "spread" &&
                                    annotation.pageNumber % 2 === 0
                                      ? Math.max(1, annotation.pageNumber - 1)
                                      : annotation.pageNumber;
                                  setPageNumber(alignedPage);
                                  setTocActive(false);
                                }}
                              >
                                Page {annotation.pageNumber}
                              </Button>
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1
                                }}
                              >
                                <Button
                                  variant="ghost"
                                  color="text"
                                  onClick={() =>
                                    beginAnnotationEdit(annotation)
                                  }
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  color="text"
                                  onClick={() => copyAnnotation(annotation)}
                                >
                                  Copy
                                </Button>
                                <Button
                                  variant="ghost"
                                  color="text"
                                  onClick={() =>
                                    removeAnnotation(annotation.id)
                                  }
                                >
                                  Remove
                                </Button>
                              </Box>
                            </Box>
                            {editingAnnotationId === annotation.id ? (
                              <>
                                <textarea
                                  className="pdf-annotation-input"
                                  value={editingAnnotationDraft}
                                  onChange={event =>
                                    setEditingAnnotationDraft(
                                      event.target.value
                                    )
                                  }
                                  placeholder="Edit note"
                                />
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 2,
                                    mt: 2
                                  }}
                                >
                                  <Button
                                    variant="ghost"
                                    color="text"
                                    onClick={saveAnnotationEdit}
                                    disabled={!editingAnnotationDraft.trim()}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    color="text"
                                    onClick={cancelAnnotationEdit}
                                  >
                                    Cancel
                                  </Button>
                                </Box>
                              </>
                            ) : (
                              <>
                                {annotation.quotedText && (
                                  <Box
                                    sx={{
                                      borderLeft: "3px solid",
                                      borderColor: "ui.gray.medium",
                                      pl: 2,
                                      mb: 1,
                                      fontStyle: "italic"
                                    }}
                                  >
                                    <Text
                                      variant="text.detail"
                                      sx={{ color: "ui.gray.dark" }}
                                    >
                                      &ldquo;{annotation.quotedText}&rdquo;
                                    </Text>
                                  </Box>
                                )}
                                {annotation.note && (
                                  <Text variant="text.detail">
                                    {annotation.note}
                                  </Text>
                                )}
                              </>
                            )}
                          </Box>
                        ))}
                    </Box>
                  ) : (
                    <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
                      No annotations yet.
                    </Text>
                  )}
                </Box>
              )}
            </Box>
          )}

          {searchActive && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Text variant="text.headers.primary">Search</Text>
              <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
                Full-text PDF search panel is not wired yet in this custom
                canvas mode.
              </Text>
            </Box>
          )}

          {displayActive && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
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

          <Box sx={{ mt: 3 }}>
            <Button variant="ghost" color="text" onClick={closePanels}>
              Close
            </Button>
          </Box>
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

const PdfTextLayer: React.FC<{
  data: TextLayerData;
  onMouseDown?: () => void;
  onMouseUp: (event: React.MouseEvent) => void;
}> = ({ data, onMouseDown, onMouseUp }) => {
  const { items, viewportTransform, canvasWidth, canvasHeight } = data;
  const [vA, vB, vC, vD, vE, vF] = viewportTransform;
  return (
    <Box
      role="none"
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        width: `${canvasWidth}px`,
        height: `${canvasHeight}px`,
        userSelect: "text",
        cursor: "text",
        overflow: "hidden",
        zIndex: 10,
        pointerEvents: "all"
      }}
    >
      {items.map((item, idx) => {
        if (!item.str) return null;
        const [ia, ib, , , itx, ity] = item.transform;
        // Apply the viewport's own transform matrix (accounts for viewBox
        // origin offsets and Y-flip) to get true canvas-pixel coordinates.
        const canvasX = vA * itx + vC * ity + vE;
        const canvasY = vB * itx + vD * ity + vF;
        // Font height in canvas pixels
        const fontHeight = Math.sqrt(
          (vA * ia + vC * ib) ** 2 + (vB * ia + vD * ib) ** 2
        );
        if (fontHeight <= 0) return null;
        // PDF.js DEFAULT_FONT_ASCENT ≈ 0.8
        const ascent = fontHeight * 0.8;
        const w = item.width > 0 ? Math.abs(vA * item.width) : undefined;
        return (
          <Box
            as="span"
            key={idx}
            sx={{
              position: "absolute",
              left: `${canvasX}px`,
              top: `${canvasY - ascent}px`,
              ...(w !== undefined ? { width: `${w}px` } : {}),
              height: `${fontHeight}px`,
              fontSize: `${fontHeight}px`,
              fontFamily: "sans-serif",
              whiteSpace: "pre",
              color: "transparent",
              cursor: "text",
              lineHeight: 1,
              userSelect: "text"
            }}
          >
            {item.str}
          </Box>
        );
      })}
    </Box>
  );
};

const PdfTocTree: React.FC<{
  items: PdfTocItem[];
  activePage: number;
  onSelectPage: (page?: number) => void;
  depth?: number;
}> = ({ items, activePage, onSelectPage, depth = 0 }) => {
  return (
    <>
      {items.map((item, idx) => (
        <PdfTocNode
          key={`${item.title}-${item.pageNumber || "na"}-${idx}`}
          item={item}
          activePage={activePage}
          onSelectPage={onSelectPage}
          depth={depth}
        />
      ))}
    </>
  );
};

const PdfTocNode: React.FC<{
  item: PdfTocItem;
  activePage: number;
  onSelectPage: (page?: number) => void;
  depth: number;
}> = ({ item, activePage, onSelectPage, depth }) => {
  const hasChildren = item.children.length > 0;
  const [expanded, setExpanded] = React.useState(true);
  const isActive = Boolean(item.pageNumber && item.pageNumber === activePage);
  const isHeading = !item.pageNumber && hasChildren;
  const itemFontWeight = isHeading ? 700 : depth > 0 ? 400 : 600;

  return (
    <Box>
      <Box
        as={item.pageNumber ? "button" : "div"}
        onClick={
          item.pageNumber ? () => onSelectPage(item.pageNumber) : undefined
        }
        sx={{
          appearance: "none",
          borderRadius: 8,
          border: "1px solid",
          borderColor: isActive
            ? "var(--reader-chrome-text, #0f172a)"
            : "transparent",
          background: "transparent",
          cursor: item.pageNumber ? "pointer" : "default",
          justifyContent: "space-between",
          alignItems: "flex-start",
          display: "flex",
          gap: 2,
          width: "100%",
          textAlign: "left",
          pl: 2 + depth * 3,
          pr: 2,
          py: 2,
          whiteSpace: "normal",
          minHeight: "unset",
          "&:focus,&:hover": {
            background: item.pageNumber
              ? "rgba(148, 163, 184, 0.14)"
              : "transparent",
            textDecoration: "none"
          },
          "&:active": {
            background: item.pageNumber
              ? "rgba(148, 163, 184, 0.22)"
              : "transparent"
          }
        }}
      >
        <Box
          sx={{ display: "flex", alignItems: "flex-start", gap: 2, flex: 1 }}
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
            {item.title}
          </Box>
        </Box>
        {item.pageNumber ? (
          <Box as="span" sx={{ whiteSpace: "nowrap", opacity: 0.8 }}>
            p. {item.pageNumber}
          </Box>
        ) : (
          <span />
        )}
      </Box>
      {hasChildren && expanded && (
        <PdfTocTree
          items={item.children}
          activePage={activePage}
          onSelectPage={onSelectPage}
          depth={depth + 1}
        />
      )}
    </Box>
  );
};
