import { storeReaderAuth, getReaderAuth } from "../readerAuth";

// ---------------------------------------------------------------------------
// Storage mocks
// ---------------------------------------------------------------------------

const makeMockStorage = () => {
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
    }),
    _store: () => store
  };
};

const sessionMock = makeMockStorage();
const localMock = makeMockStorage();

Object.defineProperty(window, "sessionStorage", {
  value: sessionMock,
  writable: true,
  configurable: true
});
Object.defineProperty(window, "localStorage", {
  value: localMock,
  writable: true,
  configurable: true
});

beforeEach(() => {
  sessionMock.clear();
  localMock.clear();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// storeReaderAuth
// ---------------------------------------------------------------------------

describe("storeReaderAuth", () => {
  test("returns a non-empty string key", () => {
    const key = storeReaderAuth({ url: "https://example.org/book.epub" });
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  test("writes to sessionStorage under reader-auth: prefix", () => {
    const payload = { url: "https://example.org/book.epub", token: "tok123" };
    const key = storeReaderAuth(payload);
    expect(sessionMock.setItem).toHaveBeenCalledWith(
      `reader-auth:${key}`,
      JSON.stringify(payload)
    );
  });

  test("also mirrors to localStorage for reload resilience", () => {
    const payload = { url: "https://example.org/book.epub" };
    const key = storeReaderAuth(payload);
    expect(localMock.setItem).toHaveBeenCalledWith(
      `reader-auth:${key}`,
      JSON.stringify(payload)
    );
  });

  test("returns a different key on each call", () => {
    const k1 = storeReaderAuth({ url: "https://example.org/a.epub" });
    const k2 = storeReaderAuth({ url: "https://example.org/b.epub" });
    expect(k1).not.toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// getReaderAuth
// ---------------------------------------------------------------------------

describe("getReaderAuth", () => {
  test("retrieves payload stored by storeReaderAuth (via sessionStorage)", () => {
    const payload = { url: "https://example.org/book.epub", token: "abc" };
    const key = storeReaderAuth(payload);
    // Simulate sessionMock returning the stored value
    sessionMock.getItem.mockImplementation((k: string) =>
      k === `reader-auth:${key}` ? JSON.stringify(payload) : null
    );
    const result = getReaderAuth(key);
    expect(result).toEqual(payload);
  });

  test("falls back to localStorage when sessionStorage returns null", () => {
    const payload = { url: "https://example.org/b.epub", token: "xyz" };
    const key = "test-fallback-key";
    sessionMock.getItem.mockReturnValue(null);
    localMock.getItem.mockImplementation((k: string) =>
      k === `reader-auth:${key}` ? JSON.stringify(payload) : null
    );
    const result = getReaderAuth(key);
    expect(result).toEqual(payload);
  });

  test("returns null when neither storage has the key", () => {
    sessionMock.getItem.mockReturnValue(null);
    localMock.getItem.mockReturnValue(null);
    expect(getReaderAuth("nonexistent")).toBeNull();
  });

  test("returns null for invalid JSON in sessionStorage", () => {
    sessionMock.getItem.mockReturnValue("{bad json");
    expect(getReaderAuth("some-key")).toBeNull();
  });

  test("mirrors sessionStorage value back into localStorage on read", () => {
    const payload = { url: "https://example.org/c.epub" };
    const key = "mirror-key";
    const storageKey = `reader-auth:${key}`;
    const raw = JSON.stringify(payload);
    sessionMock.getItem.mockImplementation((k: string) =>
      k === storageKey ? raw : null
    );
    getReaderAuth(key);
    expect(localMock.setItem).toHaveBeenCalledWith(storageKey, raw);
  });

  test("stores payload without optional token field", () => {
    const payload = { url: "https://example.org/d.epub" };
    const key = storeReaderAuth(payload);
    sessionMock.getItem.mockImplementation((k: string) =>
      k === `reader-auth:${key}` ? JSON.stringify(payload) : null
    );
    const result = getReaderAuth(key);
    expect(result).toEqual({ url: "https://example.org/d.epub" });
    expect(result?.token).toBeUndefined();
  });
});
