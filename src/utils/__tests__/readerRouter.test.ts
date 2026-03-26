import { resolveReaderActionFromFulfillmentLinks } from "../readerRouter";
import {
  AdobeDrmMediaType,
  ExternalReaderMediaType,
  EpubMediaType,
  PdfMediaType
} from "types/opds1";
import type { FulfillmentLink } from "interfaces";

const link = (contentType: string, indirectionType?: string): FulfillmentLink => ({
  contentType: contentType as any,
  url: `https://example.org/${encodeURIComponent(contentType)}`,
  supportLevel: "show",
  indirectionType: indirectionType as any
});

describe("resolveReaderActionFromFulfillmentLinks", () => {
  test("routes EPUB to epubjs", () => {
    const action = resolveReaderActionFromFulfillmentLinks([link(EpubMediaType)]);
    expect(action?.engine).toBe("epubjs");
  });

  test("routes PDF to pdfjs", () => {
    const action = resolveReaderActionFromFulfillmentLinks([link(PdfMediaType)]);
    expect(action?.engine).toBe("pdfjs");
  });

  test("routes streaming HTML to webview", () => {
    const action = resolveReaderActionFromFulfillmentLinks([
      link(ExternalReaderMediaType)
    ]);
    expect(action?.engine).toBe("webview");
  });

  test("routes webpub manifest to audiobook by default", () => {
    const action = resolveReaderActionFromFulfillmentLinks([
      link("application/webpub+json")
    ]);
    expect(action?.engine).toBe("audiobook");
  });

  test("allows overriding webpub engine", () => {
    const action = resolveReaderActionFromFulfillmentLinks(
      [link("application/webpub+json")],
      { webpubEngine: "thorium" }
    );
    expect(action?.engine).toBe("thorium");
  });

  test("routes adobe drm to external", () => {
    const action = resolveReaderActionFromFulfillmentLinks([
      link(EpubMediaType, AdobeDrmMediaType)
    ]);
    expect(action?.engine).toBe("external");
  });
});
