import { getProxiedUrl } from "../proxyUrl";

// The jest environment origin is http://test-domain.com/ (set via
// testEnvironmentOptions.url in jest.config.js).
// getProxiedUrl returns same-origin URLs as-is and routes cross-origin
// URLs through /api/fulfill.
const JSDOM_ORIGIN = "http://test-domain.com";

// ---------------------------------------------------------------------------
// getProxiedUrl
// ---------------------------------------------------------------------------

describe("getProxiedUrl", () => {
  test("proxies cross-origin https URLs through /api/fulfill", () => {
    const url = "https://cdn.library.org/books/1.epub";
    expect(getProxiedUrl(url)).toBe(
      `/api/fulfill?url=${encodeURIComponent(url)}`
    );
  });

  test("proxies cross-origin http URLs through /api/fulfill", () => {
    const url = "http://external.org/file.pdf";
    expect(getProxiedUrl(url)).toBe(
      `/api/fulfill?url=${encodeURIComponent(url)}`
    );
  });

  test("returns same-origin absolute URLs unchanged", () => {
    const url = `${JSDOM_ORIGIN}/api/book/1`;
    expect(getProxiedUrl(url)).toBe(url);
  });

  test("resolves relative paths against the jsdom origin and returns them unchanged", () => {
    // /api/book/1 resolves to same origin so should pass through
    expect(getProxiedUrl("/api/book/1")).toBe(`${JSDOM_ORIGIN}/api/book/1`);
  });

  test("URL-encodes the target URL in the proxy path", () => {
    const url = "https://cdn.library.org/books/some%20title.epub";
    const result = getProxiedUrl(url);
    // The proxy path must contain the encoded form of the target URL
    expect(result).toBe(`/api/fulfill?url=${encodeURIComponent(url)}`);
  });
});
