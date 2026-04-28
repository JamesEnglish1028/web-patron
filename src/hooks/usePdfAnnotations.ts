import * as React from "react";
import { createId } from "utils/readerAnnotations";
import type { PdfAnnotationItem, PdfBookmarkItem } from "../components/reader/readers/PdfReader.types";

type AnnotationSync = {
  syncBookmark: (
    pos: { pageNumber: number; numPages: number },
    id: string
  ) => void;
  syncNote: (
    pos: { pageNumber: number; numPages: number },
    id: string,
    content: string
  ) => void;
  removeServerBookmark: (id: string) => void;
  removeServerNote: (id: string) => void;
};

/**
 * Encapsulates PDF bookmark and annotation CRUD operations with localStorage persistence and server sync.
 */
export const usePdfAnnotations = (
  url: string,
  pageNumber: number,
  numPages: number,
  title: string | undefined,
  bookUrl: string | undefined,
  annotationSync: AnnotationSync
) => {
  const [bookmarks, setBookmarks] = React.useState<PdfBookmarkItem[]>([]);
  const [annotations, setAnnotations] = React.useState<PdfAnnotationItem[]>([]);
  const [annotationDraft, setAnnotationDraft] = React.useState("");
  const [editingAnnotationId, setEditingAnnotationId] = React.useState<
    string | null
  >(null);
  const [editingAnnotationDraft, setEditingAnnotationDraft] =
    React.useState("");

  // Load bookmarks and annotations from localStorage on URL change
  React.useEffect(() => {
    try {
      const rawBookmarks = localStorage.getItem(`reader:pdf:bookmarks:${url}`);
      const rawAnnotations = localStorage.getItem(
        `reader:pdf:annotations:${url}`
      );
      setBookmarks(rawBookmarks ? JSON.parse(rawBookmarks) : []);
      setAnnotations(rawAnnotations ? JSON.parse(rawAnnotations) : []);
    } catch {
      setBookmarks([]);
      setAnnotations([]);
    }
    setAnnotationDraft("");
    setEditingAnnotationId(null);
    setEditingAnnotationDraft("");
  }, [url]);

  // Persist bookmarks to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem(
        `reader:pdf:bookmarks:${url}`,
        JSON.stringify(bookmarks)
      );
    } catch {
      // ignore storage errors
    }
  }, [bookmarks, url]);

  // Persist annotations to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem(
        `reader:pdf:annotations:${url}`,
        JSON.stringify(annotations)
      );
    } catch {
      // ignore storage errors
    }
  }, [annotations, url]);

  const addBookmark = () => {
    if (bookmarks.some(entry => entry.pageNumber === pageNumber)) return;
    const newBookmark = { id: createId(), pageNumber, createdAt: Date.now() };
    setBookmarks(prev => [...prev, newBookmark]);
    // Sync to server (fire-and-forget)
    annotationSync.syncBookmark({ pageNumber, numPages }, newBookmark.id);
  };

  const removeBookmark = (id: string) => {
    setBookmarks(prev => prev.filter(entry => entry.id !== id));
    // Remove from server if we have a server-assigned id
    try {
      const raw = localStorage.getItem(`reader:serverIds:${url}`);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      if (map[id]) annotationSync.removeServerBookmark(map[id]);
    } catch {
      // ignore
    }
  };

  const addAnnotation = () => {
    const note = annotationDraft.trim();
    if (!note) return;
    const newAnnotation: PdfAnnotationItem = {
      id: createId(),
      pageNumber,
      note,
      createdAt: Date.now()
    };
    setAnnotations(prev => [...prev, newAnnotation]);
    setAnnotationDraft("");
    // Sync to server (fire-and-forget)
    annotationSync.syncNote({ pageNumber, numPages }, newAnnotation.id, note);
  };

  const beginAnnotationEdit = (annotation: PdfAnnotationItem) => {
    setEditingAnnotationId(annotation.id);
    setEditingAnnotationDraft(annotation.note);
  };

  const cancelAnnotationEdit = () => {
    setEditingAnnotationId(null);
    setEditingAnnotationDraft("");
  };

  const saveAnnotationEdit = () => {
    const note = editingAnnotationDraft.trim();
    if (!editingAnnotationId || !note) return;
    setAnnotations(prev =>
      prev.map(annotation =>
        annotation.id === editingAnnotationId
          ? {
              ...annotation,
              note
            }
          : annotation
      )
    );
    setEditingAnnotationId(null);
    setEditingAnnotationDraft("");
  };

  const removeAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(entry => entry.id !== id));
    if (editingAnnotationId === id) {
      setEditingAnnotationId(null);
      setEditingAnnotationDraft("");
    }
    // Remove from server if we have a server-assigned id
    try {
      const raw = localStorage.getItem(`reader:serverIds:${url}`);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      if (map[id]) annotationSync.removeServerNote(map[id]);
    } catch {
      // ignore
    }
  };

  const copyAnnotation = async (annotation: PdfAnnotationItem) => {
    const header = [title, `(Page ${annotation.pageNumber})`]
      .filter(Boolean)
      .join(" ");
    const parts: string[] = [];
    if (header) parts.push(header);
    if (annotation.quotedText) parts.push(`"${annotation.quotedText}"`);
    if (annotation.note) parts.push(annotation.note);
    parts.push(bookUrl ?? url);
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
    annotations,
    setAnnotations,
    annotationDraft,
    setAnnotationDraft,
    editingAnnotationId,
    setEditingAnnotationId,
    editingAnnotationDraft,
    setEditingAnnotationDraft,
    addBookmark,
    removeBookmark,
    addAnnotation,
    beginAnnotationEdit,
    cancelAnnotationEdit,
    saveAnnotationEdit,
    removeAnnotation,
    copyAnnotation
  };
};
