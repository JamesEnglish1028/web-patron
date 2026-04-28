import { parseAudiobookManifest } from "../audiobookManifest";
// TextEncoder/TextDecoder are Node.js globals but may be absent in older
// jsdom versions bundled with the project's jest setup.

const { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder } =
  require("util") as {
    TextEncoder: typeof TextEncoder;
    TextDecoder: typeof TextDecoder;
  };

// Polyfill for the jsdom environment used by Jest.
if (typeof global.TextDecoder === "undefined") {
  (global as any).TextDecoder = NodeTextDecoder;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = "https://example.org/books/123/manifest.json";

/** Valid minimal manifest with one track. */
const minimalManifest = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    metadata: { title: "My Book", author: "Jane Author" },
    readingOrder: [{ href: "track1.mp3", title: "Chapter 1" }],
    ...overrides
  });

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("parseAudiobookManifest — error cases", () => {
  test("throws for empty string input", () => {
    expect(() => parseAudiobookManifest("")).toThrow("empty");
  });

  test("throws for whitespace-only input", () => {
    expect(() => parseAudiobookManifest("   ")).toThrow("empty");
  });

  test("throws for invalid JSON", () => {
    expect(() => parseAudiobookManifest("{bad json")).toThrow("not valid JSON");
  });

  test("throws when readingOrder is missing", () => {
    expect(() =>
      parseAudiobookManifest(
        JSON.stringify({ metadata: { title: "X" }, readingOrder: [] })
      )
    ).toThrow("playable tracks");
  });

  test("throws when readingOrder entries all have empty hrefs", () => {
    expect(() =>
      parseAudiobookManifest(
        JSON.stringify({
          readingOrder: [{ href: "" }, { href: "   " }]
        })
      )
    ).toThrow("playable tracks");
  });
});

// ---------------------------------------------------------------------------
// Title extraction
// ---------------------------------------------------------------------------

describe("parseAudiobookManifest — title", () => {
  test("reads title from metadata.title", () => {
    const result = parseAudiobookManifest(minimalManifest());
    expect(result.title).toBe("My Book");
  });

  test("falls back to top-level payload.title when metadata.title is absent", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({
        title: "Fallback Title",
        readingOrder: [{ href: "a.mp3", title: "T1" }]
      })
    );
    expect(result.title).toBe("Fallback Title");
  });

  test("falls back to 'Untitled Audiobook' when no title found", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({ readingOrder: [{ href: "a.mp3" }] })
    );
    expect(result.title).toBe("Untitled Audiobook");
  });
});

// ---------------------------------------------------------------------------
// Author extraction
// ---------------------------------------------------------------------------

describe("parseAudiobookManifest — author", () => {
  test("reads string author from metadata", () => {
    const result = parseAudiobookManifest(minimalManifest());
    expect(result.author).toBe("Jane Author");
  });

  test("reads first string from author array", () => {
    const result = parseAudiobookManifest(
      minimalManifest({ metadata: { title: "T", author: ["Alice", "Bob"] } })
    );
    expect(result.author).toBe("Alice");
  });

  test("reads name from first object in author array", () => {
    const result = parseAudiobookManifest(
      minimalManifest({
        metadata: { title: "T", author: [{ name: "Carol Author" }] }
      })
    );
    expect(result.author).toBe("Carol Author");
  });

  test("falls back to contributor array when author absent", () => {
    const result = parseAudiobookManifest(
      minimalManifest({
        metadata: {
          title: "T",
          contributor: [{ name: "Dave Contrib", role: "author" }]
        }
      })
    );
    expect(result.author).toBe("Dave Contrib");
  });

  test("returns 'Unknown Author' when no author information present", () => {
    const result = parseAudiobookManifest(
      minimalManifest({ metadata: { title: "T" } })
    );
    expect(result.author).toBe("Unknown Author");
  });
});

// ---------------------------------------------------------------------------
// Track extraction
// ---------------------------------------------------------------------------

describe("parseAudiobookManifest — tracks", () => {
  test("parses tracks from readingOrder", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({
        readingOrder: [
          { href: "ch1.mp3", title: "Chapter 1", duration: 300 },
          { href: "ch2.mp3", title: "Chapter 2", duration: 420 }
        ]
      })
    );
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0]).toMatchObject({
      href: "ch1.mp3",
      title: "Chapter 1",
      duration: 300
    });
  });

  test("also accepts spine as the track source", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({
        spine: [{ href: "ch1.mp3", title: "Track 1" }]
      })
    );
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].href).toBe("ch1.mp3");
  });

  test("assigns 'Track N' title when entry has no title", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({ readingOrder: [{ href: "a.mp3" }, { href: "b.mp3" }] })
    );
    expect(result.tracks[0].title).toBe("Track 1");
    expect(result.tracks[1].title).toBe("Track 2");
  });

  test("accepts bare string hrefs in readingOrder", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({ readingOrder: ["track1.mp3", "track2.mp3"] })
    );
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0].href).toBe("track1.mp3");
  });

  test("skips entries with empty hrefs", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({
        readingOrder: [{ href: "" }, { href: "valid.mp3", title: "T" }]
      })
    );
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].href).toBe("valid.mp3");
  });

  test("omits duration when entry has no duration", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({ readingOrder: [{ href: "a.mp3", title: "T" }] })
    );
    expect(result.tracks[0].duration).toBeUndefined();
  });

  test("resolves relative hrefs against baseUrl", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({ readingOrder: [{ href: "ch1.mp3", title: "T" }] }),
      BASE_URL
    );
    expect(result.tracks[0].href).toBe("https://example.org/books/123/ch1.mp3");
  });

  test("leaves absolute hrefs unchanged when baseUrl provided", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({
        readingOrder: [{ href: "https://cdn.example.com/a.mp3", title: "T" }]
      }),
      BASE_URL
    );
    expect(result.tracks[0].href).toBe("https://cdn.example.com/a.mp3");
  });
});

// ---------------------------------------------------------------------------
// TOC extraction
// ---------------------------------------------------------------------------

describe("parseAudiobookManifest — toc", () => {
  test("parses toc entries", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({
        readingOrder: [{ href: "a.mp3", title: "T" }],
        toc: [
          { href: "a.mp3#t=0", title: "Intro" },
          { href: "a.mp3#t=120", title: "Chapter 1" }
        ]
      })
    );
    expect(result.toc).toHaveLength(2);
    expect(result.toc[0]).toEqual({ href: "a.mp3#t=0", title: "Intro" });
  });

  test("skips toc entries missing title or href", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({
        readingOrder: [{ href: "a.mp3", title: "T" }],
        toc: [
          { href: "a.mp3", title: "Valid" },
          { href: "", title: "No href" },
          { href: "b.mp3", title: "" }
        ]
      })
    );
    expect(result.toc).toHaveLength(1);
    expect(result.toc[0].title).toBe("Valid");
  });

  test("returns empty toc when none present", () => {
    const result = parseAudiobookManifest(minimalManifest());
    expect(result.toc).toEqual([]);
  });

  test("resolves relative toc hrefs against baseUrl", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({
        readingOrder: [{ href: "a.mp3", title: "T" }],
        toc: [{ href: "a.mp3#t=0", title: "Start" }]
      }),
      BASE_URL
    );
    expect(result.toc[0].href).toBe("https://example.org/books/123/a.mp3#t=0");
  });
});

// ---------------------------------------------------------------------------
// Cover image extraction
// ---------------------------------------------------------------------------

describe("parseAudiobookManifest — coverImageUrl", () => {
  test("extracts cover from links array", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({
        readingOrder: [{ href: "a.mp3", title: "T" }],
        links: [{ rel: "cover", href: "cover.jpg" }]
      })
    );
    expect(result.coverImageUrl).toBe("cover.jpg");
  });

  test("extracts cover from resources array", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({
        readingOrder: [{ href: "a.mp3", title: "T" }],
        resources: [{ rel: ["cover"], href: "cover.jpg" }]
      })
    );
    expect(result.coverImageUrl).toBe("cover.jpg");
  });

  test("resolves relative cover href against baseUrl", () => {
    const result = parseAudiobookManifest(
      JSON.stringify({
        readingOrder: [{ href: "a.mp3", title: "T" }],
        links: [{ rel: "cover", href: "cover.jpg" }]
      }),
      BASE_URL
    );
    expect(result.coverImageUrl).toBe(
      "https://example.org/books/123/cover.jpg"
    );
  });

  test("returns undefined when no cover present", () => {
    const result = parseAudiobookManifest(minimalManifest());
    expect(result.coverImageUrl).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ArrayBuffer input
// ---------------------------------------------------------------------------

describe("parseAudiobookManifest — ArrayBuffer input", () => {
  test("accepts ArrayBuffer in addition to string", () => {
    const str = minimalManifest();
    const buf = new NodeTextEncoder().encode(str).buffer;
    const result = parseAudiobookManifest(buf);
    expect(result.title).toBe("My Book");
    expect(result.tracks).toHaveLength(1);
  });
});
