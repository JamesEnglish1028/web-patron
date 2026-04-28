import * as React from "react";
import {
  type ReaderBookmark,
  type ReaderCitation,
  saveBookmarks,
  saveCitations
} from "utils/readerAnnotations";
import { createId } from "utils/readerAnnotations";
import type { EpubBookLike } from "../components/reader/readers/EpubReader.types";

type AnnotationSync = {
  syncBookmark: (
    pos: { cfi: string; progressPercent?: number },
    id: string,
    label: string
  ) => void;
  syncNote: (pos: { cfi: string }, id: string, content: string) => void;
  removeServerBookmark: (id: string) => void;
  removeServerNote: (id: string) => void;
};

/**
 * Encapsulates EPUB bookmark and citation CRUD operations with localStorage persistence and server sync.
 */
export const useEpubAnnotations = (
  url: string,
  currentCfi: string,
  currentChapter: string,
  currentPageLabel: string,
  bookRef: React.RefObject<EpubBookLike | null>,
  metadataTitle: string,
  title: string | undefined,
  annotationSync: AnnotationSync
) => {
  const [bookmarks, setBookmarks] = React.useState<ReaderBookmark[]>([]);
  const [citations, setCitations] = React.useState<ReaderCitation[]>([]);
  const [citationDraft, setCitationDraft] = React.useState("");
  const [editingCitationId, setEditingCitationId] = React.useState<
    string | null
  >(null);
  const [editingCitationDraft, setEditingCitationDraft] = React.useState("");
  const [pendingCitationText, setPendingCitationText] = React.useState<
    string | null
  >(null);

  // Sync memos for sorted bookmarks and citations
  const sortedBookmarks = React.useMemo(
    () =>
      bookmarks
        .slice()
        .sort(
          (a, b) =>
            (a.locationIndex ?? Number.MAX_SAFE_INTEGER) -
            (b.locationIndex ?? Number.MAX_SAFE_INTEGER)
        ),
    [bookmarks]
  );

  const sortedCitations = React.useMemo(
    () => citations.slice().sort((a, b) => b.createdAt - a.createdAt),
    [citations]
  );

  const bookmarkActive = React.useMemo(
    () =>
      Boolean(currentCfi && bookmarks.some(entry => entry.cfi === currentCfi)),
    [bookmarks, currentCfi]
  );

  const addBookmark = () => {
    if (!currentCfi) return;
    let locationIndex: number | undefined;
    let progressPercent: number | undefined;
    try {
      const locations = bookRef.current?.locations;
      if (locations?.locationFromCfi && locations?.percentageFromCfi) {
        const loc = locations.locationFromCfi(currentCfi);
        if (typeof loc === "number" && Number.isFinite(loc)) {
          locationIndex = Math.max(1, Math.round(loc));
        }
        const pct = locations.percentageFromCfi(currentCfi);
        if (typeof pct === "number" && Number.isFinite(pct)) {
          progressPercent = Math.max(0, Math.min(100, Math.round(pct * 100)));
        }
      }
    } catch {
      // ignore location metadata errors
    }
    const bookmark: ReaderBookmark = {
      id: createId(),
      cfi: currentCfi,
      label: currentChapter || currentPageLabel || "Bookmark",
      chapter: currentChapter || undefined,
      pageLabel: currentPageLabel || undefined,
      locationIndex,
      progressPercent,
      createdAt: Date.now()
    };
    const next = [
      bookmark,
      ...bookmarks.filter(entry => entry.cfi !== currentCfi)
    ];
    setBookmarks(next);
    saveBookmarks(url, next);
    // Sync to server (fire-and-forget)
    annotationSync.syncBookmark(
      { cfi: currentCfi, progressPercent },
      bookmark.id,
      bookmark.label
    );
  };

  const removeBookmark = (id: string) => {
    const next = bookmarks.filter(entry => entry.id !== id);
    setBookmarks(next);
    saveBookmarks(url, next);
    // Remove from server if we have a server-assigned id
    try {
      const raw = localStorage.getItem(`reader:serverIds:${url}`);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      if (map[id]) annotationSync.removeServerBookmark(map[id]);
    } catch {
      // ignore
    }
  };

  const addCitation = () => {
    const note = citationDraft.trim();
    if (!currentCfi || (!note && !pendingCitationText)) return;
    const citation: ReaderCitation = {
      id: createId(),
      cfi: currentCfi,
      note,
      quotedText: pendingCitationText ?? undefined,
      chapter: currentChapter || undefined,
      pageLabel: currentPageLabel || undefined,
      createdAt: Date.now()
    };
    const next = [citation, ...citations];
    setCitations(next);
    saveCitations(url, next);
    // Sync to server (fire-and-forget)
    annotationSync.syncNote(
      { cfi: currentCfi },
      citation.id,
      [citation.quotedText ? `"${citation.quotedText}"` : "", note]
        .filter(Boolean)
        .join("\n")
    );
    setCitationDraft("");
    setPendingCitationText(null);
  };

  const removeCitation = (id: string) => {
    const next = citations.filter(entry => entry.id !== id);
    setCitations(next);
    saveCitations(url, next);
    // Remove from server if we have a server-assigned id
    try {
      const raw = localStorage.getItem(`reader:serverIds:${url}`);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      if (map[id]) annotationSync.removeServerNote(map[id]);
    } catch {
      // ignore
    }
    if (editingCitationId === id) {
      setEditingCitationId(null);
      setEditingCitationDraft("");
    }
  };

  const beginCitationEdit = (citation: ReaderCitation) => {
    setEditingCitationId(citation.id);
    setEditingCitationDraft(citation.note);
  };

  const cancelCitationEdit = () => {
    setEditingCitationId(null);
    setEditingCitationDraft("");
  };

  const saveCitationEdit = () => {
    const note = editingCitationDraft.trim();
    if (!editingCitationId || !note) return;
    const next = citations.map(entry =>
      entry.id === editingCitationId
        ? {
            ...entry,
            note
          }
        : entry
    );
    setCitations(next);
    saveCitations(url, next);
    setEditingCitationId(null);
    setEditingCitationDraft("");
  };

  const copyCitation = async (citation: ReaderCitation) => {
    const bookTitle = metadataTitle || title || undefined;
    const header = [
      citation.chapter || bookTitle,
      citation.pageLabel ? `(${citation.pageLabel})` : undefined
    ]
      .filter(Boolean)
      .join(" ");
    const parts: string[] = [];
    if (header) parts.push(header);
    if (citation.quotedText) parts.push(`"${citation.quotedText}"`);
    if (citation.note) parts.push(citation.note);
    parts.push(url);
    const payload = parts.join("\n");
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // ignore clipboard errors
    }
  };

  return {
    bookmarks,
    setBookmarks,
    citations,
    setCitations,
    citationDraft,
    setCitationDraft,
    editingCitationId,
    setEditingCitationId,
    editingCitationDraft,
    setEditingCitationDraft,
    pendingCitationText,
    setPendingCitationText,
    sortedBookmarks,
    sortedCitations,
    bookmarkActive,
    addBookmark,
    removeBookmark,
    addCitation,
    removeCitation,
    beginCitationEdit,
    cancelCitationEdit,
    saveCitationEdit,
    copyCitation
  };
};
