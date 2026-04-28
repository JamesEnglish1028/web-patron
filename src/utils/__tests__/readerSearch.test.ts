import { performBookSearch } from "../readerSearch";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal epubjs spine item stub that returns the given text results. */
const makeSpineItem = (results: { cfi: string; excerpt: string }[]) => ({
  load: jest.fn().mockResolvedValue(undefined),
  unload: jest.fn(),
  find: jest.fn().mockReturnValue(results)
});

/** Build a minimal epubjs book stub with the given spine items. */
const makeBook = (items: ReturnType<typeof makeSpineItem>[]) => ({
  spine: { spineItems: items },
  load: jest.fn()
});

// ---------------------------------------------------------------------------
// performBookSearch
// ---------------------------------------------------------------------------

describe("performBookSearch", () => {
  it("returns empty array for an empty query", async () => {
    const book = makeBook([
      makeSpineItem([{ cfi: "epubcfi(/1)", excerpt: "hello" }])
    ]);
    expect(await performBookSearch(book, "")).toEqual([]);
    expect(await performBookSearch(book, "   ")).toEqual([]);
  });

  it("returns empty array when book is null", async () => {
    expect(await performBookSearch(null, "hello")).toEqual([]);
  });

  it("returns empty array when book has no spine", async () => {
    expect(await performBookSearch({}, "hello")).toEqual([]);
  });

  it("returns empty array when spine items list is empty", async () => {
    const book = makeBook([]);
    expect(await performBookSearch(book, "hello")).toEqual([]);
  });

  it("returns results from a single spine item", async () => {
    const results = [
      { cfi: "epubcfi(/6/4!/4/2)", excerpt: "…hello world…" },
      { cfi: "epubcfi(/6/4!/4/4)", excerpt: "…say hello…" }
    ];
    const item = makeSpineItem(results);
    const book = makeBook([item]);

    const found = await performBookSearch(book, "hello");

    expect(found).toEqual(results);
  });

  it("merges results across multiple spine items", async () => {
    const r1 = [{ cfi: "epubcfi(/6/2!/1)", excerpt: "…hello in chapter 1…" }];
    const r2 = [{ cfi: "epubcfi(/6/4!/1)", excerpt: "…hello in chapter 2…" }];
    const book = makeBook([makeSpineItem(r1), makeSpineItem(r2)]);

    const found = await performBookSearch(book, "hello");

    expect(found).toHaveLength(2);
    expect(found).toEqual([...r1, ...r2]);
  });

  it("calls load and unload on each spine item", async () => {
    const item1 = makeSpineItem([]);
    const item2 = makeSpineItem([]);
    const book = makeBook([item1, item2]);

    await performBookSearch(book, "test");

    expect(item1.load).toHaveBeenCalledTimes(1);
    expect(item1.unload).toHaveBeenCalledTimes(1);
    expect(item2.load).toHaveBeenCalledTimes(1);
    expect(item2.unload).toHaveBeenCalledTimes(1);
  });

  it("still returns results from other items when one item's find throws", async () => {
    const goodResults = [{ cfi: "epubcfi(/6/4!/1)", excerpt: "…found…" }];
    const badItem = {
      load: jest.fn().mockResolvedValue(undefined),
      unload: jest.fn(),
      find: jest.fn().mockImplementation(() => {
        throw new Error("find failed");
      })
    };
    const goodItem = makeSpineItem(goodResults);
    const book = makeBook([badItem, goodItem]);

    const found = await performBookSearch(book, "found");

    expect(found).toEqual(goodResults);
    // unload should still be called on the bad item (via finally)
    expect(badItem.unload).toHaveBeenCalledTimes(1);
  });

  it("still returns results when one item's load rejects", async () => {
    const goodResults = [{ cfi: "epubcfi(/6/4!/1)", excerpt: "…text…" }];
    const failItem = {
      load: jest.fn().mockRejectedValue(new Error("load failed")),
      unload: jest.fn(),
      find: jest.fn()
    };
    const goodItem = makeSpineItem(goodResults);
    const book = makeBook([failItem, goodItem]);

    const found = await performBookSearch(book, "text");

    expect(found).toEqual(goodResults);
  });

  it("trims whitespace from the query before searching", async () => {
    const item = makeSpineItem([]);
    const book = makeBook([item]);

    await performBookSearch(book, "  hello  ");

    expect(item.find).toHaveBeenCalledWith("hello");
  });

  it("returns empty array when all spine items return no matches", async () => {
    const book = makeBook([
      makeSpineItem([]),
      makeSpineItem([]),
      makeSpineItem([])
    ]);
    expect(await performBookSearch(book, "xyznotfound")).toEqual([]);
  });
});
