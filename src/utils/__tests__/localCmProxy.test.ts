import { toBrowserFetchUrl } from "../localCmProxy";

// ---------------------------------------------------------------------------
// toBrowserFetchUrl
// ---------------------------------------------------------------------------

describe("toBrowserFetchUrl", () => {
  test("rewrites localhost:6500 to /api/cm proxy path", () => {
    const url = "http://localhost:6500/api/book/1.epub";
    const result = toBrowserFetchUrl(url);
    expect(result).toMatch(/^\/api\/cm\?url=/);
    expect(result).toContain(encodeURIComponent("http://localhost:6500/api/book/1.epub"));
  });

  test("rewrites 127.0.0.1:6500 to /api/cm proxy path", () => {
    const url = "http://127.0.0.1:6500/file.pdf";
    const result = toBrowserFetchUrl(url);
    expect(result).toMatch(/^\/api\/cm\?url=/);
  });

  test("rewrites [::1]:6500 (IPv6 loopback) to /api/cm proxy path", () => {
    const url = "http://[::1]:6500/manifest.json";
    const result = toBrowserFetchUrl(url);
    expect(result).toMatch(/^\/api\/cm\?url=/);
  });

  test("appends a cache-bust timestamp parameter", () => {
    const url = "http://localhost:6500/api/book/1.epub";
    const result = toBrowserFetchUrl(url);
    expect(result).toMatch(/&_=\d+$/);
  });

  test("leaves external https URLs unchanged", () => {
    const url = "https://cdn.library.org/books/1.epub";
    expect(toBrowserFetchUrl(url)).toBe(url);
  });

  test("leaves external http URLs with different port unchanged", () => {
    const url = "http://localhost:3000/book.epub";
    expect(toBrowserFetchUrl(url)).toBe(url);
  });

  test("leaves localhost on a non-6500 port unchanged", () => {
    const url = "http://localhost:4000/file.pdf";
    expect(toBrowserFetchUrl(url)).toBe(url);
  });

  test("leaves relative paths unchanged", () => {
    const url = "/api/book/1";
    expect(toBrowserFetchUrl(url)).toBe(url);
  });

  test("leaves unparseable strings unchanged", () => {
    const url = "not a url :::";
    expect(toBrowserFetchUrl(url)).toBe(url);
  });
});
