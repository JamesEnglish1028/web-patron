import * as React from "react";
import { Box } from "theme-ui";
import { Text } from "components/Text";
import ReaderControls from "../ReaderControls";
import ReaderUtilityControls from "../ReaderUtilityControls";

type PdfReaderProbeProps = {
  pdfUrl: string;
  title?: string;
  setLoading: (value: boolean) => void;
  onFail: (reason?: string) => void;
};

const supportsPdfJsRuntime = () => {
  if (typeof window === "undefined") return false;
  return Boolean(
    typeof DOMMatrix === "function" && typeof Path2D === "function"
  );
};

const ensurePdfJsCompat = () => {
  const promiseCtor = Promise as PromiseConstructor & {
    withResolvers?: <T>() => {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  };

  if (!promiseCtor.withResolvers) {
    promiseCtor.withResolvers = function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
};

const toReasonMessage = (err: unknown) => {
  if (err instanceof Error) {
    const stackLine = err.stack?.split("\n")?.[1]?.trim();
    return stackLine
      ? `${err.name}: ${err.message} (${stackLine})`
      : `${err.name}: ${err.message}`;
  }

  if (typeof err === "string") {
    return err;
  }

  return "Unknown PDF probe setup error";
};

const PdfReaderProbe: React.FC<PdfReaderProbeProps> = ({
  pdfUrl,
  title,
  setLoading,
  onFail
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const pdfRef = React.useRef<any>(null);
  const renderTaskRef = React.useRef<any>(null);
  const [workerReady, setWorkerReady] = React.useState(false);
  const [pdfReady, setPdfReady] = React.useState(false);
  const [pageNumber, setPageNumber] = React.useState(1);
  const [numPages, setNumPages] = React.useState(0);
  const [scale, setScale] = React.useState(1);
  const [containerWidth, setContainerWidth] = React.useState(960);

  React.useEffect(() => {
    let active = true;

    const configureWorker = async () => {
      ensurePdfJsCompat();
      if (!supportsPdfJsRuntime()) {
        onFail("Missing browser APIs required by PDF.js runtime.");
        return;
      }

      try {
        const pdfjs = await import("pdfjs-dist/webpack.mjs");
        if (!active) return;
        setWorkerReady(true);

        const loadingTask = pdfjs.getDocument({ url: pdfUrl });
        const pdf = await loadingTask.promise;
        if (!active) {
          await pdf.destroy();
          return;
        }
        pdfRef.current = pdf;
        setNumPages(pdf.numPages || 0);
        setPageNumber(1);
        setPdfReady(true);
      } catch (err) {
        if (active) {
          onFail(`probe:init ${toReasonMessage(err)}`);
        }
      }
    };

    configureWorker();

    return () => {
      active = false;
      if (renderTaskRef.current?.cancel) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      if (pdfRef.current?.destroy) {
        pdfRef.current.destroy();
        pdfRef.current = null;
      }
    };
  }, [onFail, pdfUrl]);

  React.useEffect(() => {
    const renderPage = async () => {
      if (!workerReady || !pdfReady || !pdfRef.current || !canvasRef.current) {
        return;
      }

      try {
        const pdf = pdfRef.current;
        const page = await pdf.getPage(pageNumber);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) {
          onFail("Failed to create canvas context for PDF rendering.");
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const widthScale = Math.max(
          0.1,
          (containerWidth - 48) / baseViewport.width
        );
        const effectiveScale = Math.max(0.25, widthScale * scale);
        const viewport = page.getViewport({ scale: effectiveScale });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        if (renderTaskRef.current?.cancel) {
          renderTaskRef.current.cancel();
        }

        const renderTask = page.render({
          canvasContext: context,
          viewport
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        setLoading(false);
      } catch (err) {
        const message = toReasonMessage(err);
        if (!message.toLowerCase().includes("renderingcancelledexception")) {
          onFail(`probe:render ${message}`);
        }
      }
    };

    renderPage();
  }, [
    workerReady,
    pdfReady,
    pageNumber,
    scale,
    containerWidth,
    onFail,
    setLoading
  ]);

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

  const goPrev = () => setPageNumber(prev => Math.max(1, prev - 1));
  const goNext = () =>
    setPageNumber(prev => (numPages ? Math.min(numPages, prev + 1) : prev + 1));
  const decreaseZoom = () => setScale(prev => Math.max(0.6, prev - 0.1));
  const increaseZoom = () => setScale(prev => Math.min(2, prev + 0.1));

  if (!workerReady || !pdfReady) {
    return (
      <Box sx={{ p: 4 }}>
        <Text>Preparing PDF viewer...</Text>
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
        progressLabel={
          numPages ? `Page ${pageNumber} of ${numPages}` : "Loading pages..."
        }
        onPrev={goPrev}
        onNext={goNext}
        onDecrease={decreaseZoom}
        onIncrease={increaseZoom}
        canPrev={pageNumber > 1}
        canNext={numPages ? pageNumber < numPages : true}
        extraControls={
          <ReaderUtilityControls disableToc disableSearch disableTheme />
        }
      />
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          minHeight: "70vh",
          overflow: "auto",
          p: 3,
          display: "flex",
          justifyContent: "center"
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: 1100,
            display: "flex",
            justifyContent: "center"
          }}
        >
          <Box
            sx={{
              background: "#ffffff",
              borderRadius: 6,
              boxShadow: "0 6px 18px rgba(15, 23, 42, 0.15)",
              p: 2
            }}
          >
            <canvas ref={canvasRef} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default PdfReaderProbe;
