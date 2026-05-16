import * as React from "react";
import { toBrowserFetchUrl } from "utils/localCmProxy";
import { getProxiedUrl } from "utils/proxyUrl";
import type {
  PdfJsModule,
  PdfDocument,
  PdfOutlineNode,
  PdfExplicitDestination,
  PdfTocItem
} from "../components/reader/readers/PdfReader.types";

type UsePdfDocumentReturn = {
  pdfRef: React.MutableRefObject<PdfDocument | null>;
  pdfData: Uint8Array | null;
  pdfUrl: string | null;
  numPages: number;
  tocItems: PdfTocItem[];
  useNativeFallback: boolean;
  error: string | null;
};

/**
 * Encapsulates PDF document loading and initialization logic.
 * Handles both fetching PDF bytes and initializing pdfjs with outline parsing.
 * Returns refs and state needed for PDF rendering.
 */
export const usePdfDocument = (
  url: string,
  authToken: string | undefined,
  setLoading: (value: boolean) => void
): UsePdfDocumentReturn => {
  const pdfRef = React.useRef<PdfDocument | null>(null);
  const objectUrlRef = React.useRef<string | null>(null);
  const renderTasksRef = React.useRef<any[]>([]);

  const [error, setError] = React.useState<string | null>(null);
  const [pdfData, setPdfData] = React.useState<Uint8Array | null>(null);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [numPages, setNumPages] = React.useState(0);
  const [tocItems, setTocItems] = React.useState<PdfTocItem[]>([]);
  const [useNativeFallback, setUseNativeFallback] = React.useState(false);

  // Phase 1 — Fetch: Download the PDF bytes through the proxy and store them
  // as a Uint8Array + blob URL. All state is reset here so stale content
  // from a previous URL is never shown.
  React.useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      setPdfData(null);
      setPdfUrl(null);
      setNumPages(0);
      setUseNativeFallback(false);
      setTocItems([]);

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

  // Phase 2 — Initialize: Dynamically import pdfjs, parse the document, and
  // resolve the PDF outline into page-number-based TOC entries. Falls back to
  // the native browser PDF viewer if custom canvas renderer fails to initialize.
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
        if (active) {
          setTocItems(parsedOutline);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown PDF init error";
        console.warn(
          "Custom PDF renderer failed, using native fallback:",
          message
        );
        if (active) {
          setUseNativeFallback(true);
          setLoading(false);
        }
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

  return {
    pdfRef,
    pdfData,
    pdfUrl,
    numPages,
    tocItems,
    useNativeFallback,
    error
  };
};
