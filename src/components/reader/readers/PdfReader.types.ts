// PDF.js module and type shims for PDF rendering

export type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (source: { url: string } | { data: Uint8Array }) => {
    promise: Promise<PdfDocument>;
  };
};

export type PdfViewport = {
  width: number;
  height: number;
  transform: number[];
};

export type PdfRenderTask = {
  promise: Promise<void>;
  cancel?: () => void;
};

export type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

export type PdfTextContent = {
  items: PdfTextItem[];
};

export type TextLayerData = {
  items: PdfTextItem[];
  viewportTransform: number[];
  canvasWidth: number;
  canvasHeight: number;
};

export type PdfPage = {
  getViewport: (args: { scale: number }) => PdfViewport;
  render: (args: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => PdfRenderTask;
  getTextContent?: () => Promise<PdfTextContent>;
};

export type PdfDestinationRef = unknown;

export type PdfExplicitDestination = [PdfDestinationRef, ...unknown[]];

export type PdfOutlineNode = {
  title?: string;
  dest?: string | PdfExplicitDestination | null;
  items?: PdfOutlineNode[];
};

export type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  getOutline?: () => Promise<PdfOutlineNode[] | null>;
  getDestination?: (name: string) => Promise<PdfExplicitDestination | null>;
  getPageIndex?: (ref: PdfDestinationRef) => Promise<number>;
  destroy?: () => Promise<void>;
};

export type PdfTocItem = {
  title: string;
  pageNumber?: number;
  children: PdfTocItem[];
};

export type PdfBookmarkItem = {
  id: string;
  pageNumber: number;
  createdAt: number;
};

export type PdfAnnotationItem = {
  id: string;
  pageNumber: number;
  note: string;
  quotedText?: string;
  createdAt: number;
};

export type PdfSearchResult = {
  pageNumber: number;
  excerpt: string;
};

export type PdfReaderProps = {
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
