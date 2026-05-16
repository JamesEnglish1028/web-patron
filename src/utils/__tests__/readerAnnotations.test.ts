import {
  loadBookmarks,
  saveBookmarks,
  loadCitations,
  saveCitations,
  createId,
  type ReaderBookmark,
  type ReaderCitation
} from "../readerAnnotations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeBookmark = (
  overrides: Partial<ReaderBookmark> = {}
): ReaderBookmark => ({
  id: "bm-1",
  cfi: "epubcfi(/6/4[intro]!/4/2/1:0)",
  label: "Chapter 1",
  createdAt: 1000,
  ...overrides
});

const makeCitation = (
  overrides: Partial<ReaderCitation> = {}
): ReaderCitation => ({
  id: "ct-1",
  cfi: "epubcfi(/6/4[intro]!/4/2/1:0)",
  note: "Interesting passage",
  createdAt: 2000,
  ...overrides
});

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

beforeEach(() => {
  localStorageMock.clear();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createId
// ---------------------------------------------------------------------------

describe("createId", () => {
  it("returns a non-empty string", () => {
    expect(typeof createId()).toBe("string");
    expect(createId().length).toBeGreaterThan(0);
  });

  it("produces unique values on successive calls", () => {
    const ids = Array.from({ length: 20 }, () => createId());
    const unique = new Set(ids);
    expect(unique.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

describe("loadBookmarks", () => {
  it("returns empty array when nothing is stored", () => {
    expect(loadBookmarks("book-1")).toEqual([]);
  });

  it("returns empty array when stored value is invalid JSON", () => {
    localStorageMock.getItem.mockReturnValueOnce("not-json{{{");
    expect(loadBookmarks("book-1")).toEqual([]);
  });

  it("returns parsed bookmarks when key exists", () => {
    const bookmarks = [makeBookmark()];
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(bookmarks));
    expect(loadBookmarks("book-1")).toEqual(bookmarks);
  });

  it("uses the correct localStorage key", () => {
    loadBookmarks("my-book-url");
    expect(localStorageMock.getItem).toHaveBeenCalledWith(
      "reader:bookmarks:my-book-url"
    );
  });
});

describe("saveBookmarks", () => {
  it("writes serialised bookmarks to localStorage", () => {
    const bookmarks = [
      makeBookmark(),
      makeBookmark({ id: "bm-2", cfi: "epubcfi(/6/6)" })
    ];
    saveBookmarks("book-1", bookmarks);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "reader:bookmarks:book-1",
      JSON.stringify(bookmarks)
    );
  });

  it("persists optional fields (chapter, pageLabel, progressPercent)", () => {
    const bookmark = makeBookmark({
      chapter: "Intro",
      pageLabel: "Page 3",
      progressPercent: 12,
      locationIndex: 42
    });
    saveBookmarks("book-1", [bookmark]);
    const stored = JSON.parse(
      localStorageMock.setItem.mock.calls[0][1] as string
    ) as ReaderBookmark[];
    expect(stored[0]).toMatchObject({
      chapter: "Intro",
      pageLabel: "Page 3",
      progressPercent: 12,
      locationIndex: 42
    });
  });

  it("round-trips through save then load", () => {
    const bookmarks = [makeBookmark(), makeBookmark({ id: "bm-2" })];
    saveBookmarks("book-1", bookmarks);
    // Simulate what load does: read back from setItem call
    const raw = localStorageMock.setItem.mock.calls[0][1] as string;
    localStorageMock.getItem.mockReturnValueOnce(raw);
    expect(loadBookmarks("book-1")).toEqual(bookmarks);
  });
});

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

describe("loadCitations", () => {
  it("returns empty array when nothing is stored", () => {
    expect(loadCitations("book-1")).toEqual([]);
  });

  it("returns empty array when stored value is invalid JSON", () => {
    localStorageMock.getItem.mockReturnValueOnce("][bad");
    expect(loadCitations("book-1")).toEqual([]);
  });

  it("returns parsed citations when key exists", () => {
    const citations = [makeCitation()];
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(citations));
    expect(loadCitations("book-1")).toEqual(citations);
  });

  it("uses the correct localStorage key", () => {
    loadCitations("my-book-url");
    expect(localStorageMock.getItem).toHaveBeenCalledWith(
      "reader:citations:my-book-url"
    );
  });
});

describe("saveCitations", () => {
  it("writes serialised citations to localStorage", () => {
    const citations = [makeCitation()];
    saveCitations("book-1", citations);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "reader:citations:book-1",
      JSON.stringify(citations)
    );
  });

  it("persists optional fields (quotedText, chapter, pageLabel)", () => {
    const citation = makeCitation({
      quotedText: "A great quote",
      chapter: "Ch. 2",
      pageLabel: "Page 17"
    });
    saveCitations("book-1", [citation]);
    const stored = JSON.parse(
      localStorageMock.setItem.mock.calls[0][1] as string
    ) as ReaderCitation[];
    expect(stored[0]).toMatchObject({
      quotedText: "A great quote",
      chapter: "Ch. 2",
      pageLabel: "Page 17"
    });
  });

  it("round-trips through save then load", () => {
    const citations = [
      makeCitation(),
      makeCitation({ id: "ct-2", note: "Another" })
    ];
    saveCitations("book-1", citations);
    const raw = localStorageMock.setItem.mock.calls[0][1] as string;
    localStorageMock.getItem.mockReturnValueOnce(raw);
    expect(loadCitations("book-1")).toEqual(citations);
  });

  it("bookmarks and citations use different keys for the same book", () => {
    saveBookmarks("book-1", [makeBookmark()]);
    saveCitations("book-1", [makeCitation()]);
    const keys = localStorageMock.setItem.mock.calls.map(
      (call: [string, string]) => call[0]
    );
    expect(keys[0]).toBe("reader:bookmarks:book-1");
    expect(keys[1]).toBe("reader:citations:book-1");
    expect(keys[0]).not.toBe(keys[1]);
  });
});
