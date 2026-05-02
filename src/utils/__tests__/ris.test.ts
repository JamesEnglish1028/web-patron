import download from "downloadjs";
import { buildRisRecord, downloadAnnotationAsRis } from "../ris";

jest.mock("downloadjs", () => jest.fn());

const mockedDownload = download as jest.Mock;

describe("buildRisRecord", () => {
  it("builds a valid RIS record with required envelope tags", () => {
    const ris = buildRisRecord(
      {
        id: "ann-1",
        note: "Reader note",
        quotedText: "Quoted line",
        pageNumber: 38,
        createdAt: Date.UTC(2026, 4, 1)
      },
      {
        title: "Academic Pipeline Programs",
        author: "Byrd, Curtis D.",
        publisher: "Lever Press",
        url: "https://example.com/book",
        referenceType: "EBOOK"
      }
    );

    expect(ris.startsWith("TY  - EBOOK\r\n")).toBe(true);
    expect(ris).toContain("ID  - ann-1\r\n");
    expect(ris).toContain("T1  - Academic Pipeline Programs\r\n");
    expect(ris).toContain("AU  - Byrd, Curtis D.\r\n");
    expect(ris).toContain("PB  - Lever Press\r\n");
    expect(ris).toContain("SP  - 38\r\n");
    expect(ris).toContain("N1  - Reader note\r\n");
    expect(ris).toContain("N2  - Quoted line\r\n");
    expect(ris).toContain("UR  - https://example.com/book\r\n");
    expect(ris).toContain("Y2  - 2026/05/01\r\n");
    expect(ris.endsWith("ER  -\r\n")).toBe(true);
  });

  it("repeats AU tags for multiple authors and strips line breaks", () => {
    const ris = buildRisRecord(
      {
        id: "ann-2",
        note: "line 1\nline 2",
        pageLabel: "Page 12"
      },
      {
        title: "Sample",
        author: "Alpha, A.; Beta, B. and Gamma, C.",
        referenceType: "BOOK"
      }
    );

    expect(ris).toContain("AU  - Alpha, A.\r\n");
    expect(ris).toContain("AU  - Beta, B.\r\n");
    expect(ris).toContain("AU  - Gamma, C.\r\n");
    expect(ris).toContain("SP  - 12\r\n");
    expect(ris).toContain("N1  - line 1 line 2\r\n");
  });
});

describe("downloadAnnotationAsRis", () => {
  beforeEach(() => {
    mockedDownload.mockClear();
  });

  it("downloads RIS text with .ris filename and RIS media type", () => {
    downloadAnnotationAsRis(
      {
        id: "ann-3",
        note: "Great quote",
        pageNumber: 4
      },
      {
        title: "Demo Book",
        author: "Doe, Jane",
        publisher: "Acme",
        url: "https://example.com/demo"
      }
    );

    expect(mockedDownload).toHaveBeenCalledTimes(1);
    const [content, filename, contentType] = mockedDownload.mock.calls[0];
    expect(typeof content).toBe("string");
    expect(content).toContain("TY  - BOOK\r\n");
    expect(filename).toMatch(/\.ris$/);
    expect(contentType).toBe("application/x-research-info-systems");
  });
});
