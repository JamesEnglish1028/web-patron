export type ReaderBookmark = {
  id: string;
  cfi: string;
  label: string;
  chapter?: string;
  pageLabel?: string;
  locationIndex?: number;
  progressPercent?: number;
  createdAt: number;
};

export type ReaderCitation = {
  id: string;
  cfi: string;
  note: string;
  chapter?: string;
  pageLabel?: string;
  createdAt: number;
};

const bookmarkKey = (bookKey: string) => `reader:bookmarks:${bookKey}`;
const citationKey = (bookKey: string) => `reader:citations:${bookKey}`;

const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const loadBookmarks = (bookKey: string): ReaderBookmark[] => {
  try {
    return safeParse<ReaderBookmark[]>(localStorage.getItem(bookmarkKey(bookKey)), []);
  } catch {
    return [];
  }
};

export const saveBookmarks = (bookKey: string, bookmarks: ReaderBookmark[]) => {
  try {
    localStorage.setItem(bookmarkKey(bookKey), JSON.stringify(bookmarks));
  } catch {
    // ignore storage errors
  }
};

export const loadCitations = (bookKey: string): ReaderCitation[] => {
  try {
    return safeParse<ReaderCitation[]>(localStorage.getItem(citationKey(bookKey)), []);
  } catch {
    return [];
  }
};

export const saveCitations = (bookKey: string, citations: ReaderCitation[]) => {
  try {
    localStorage.setItem(citationKey(bookKey), JSON.stringify(citations));
  } catch {
    // ignore storage errors
  }
};

export const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
