import download from "downloadjs";
import { generateFilename } from "utils/file";

export type RisAnnotation = {
  id: string;
  note?: string;
  quotedText?: string;
  chapter?: string;
  pageLabel?: string;
  pageNumber?: number;
  createdAt?: number;
};

export type RisMetadata = {
  title?: string;
  author?: string;
  publisher?: string;
  url?: string;
  referenceType?: string;
};

const sanitizeValue = (value: string) =>
  value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const splitAuthors = (author?: string): string[] => {
  if (!author) return [];
  return author
    .split(/;|\band\b|\n/i)
    .map(part => sanitizeValue(part))
    .filter(Boolean);
};

const parsePageFromLabel = (pageLabel?: string): string | undefined => {
  if (!pageLabel) return undefined;
  const match = pageLabel.match(/\d+/);
  return match?.[0];
};

const toRisDate = (timestamp?: number): string | undefined => {
  if (!timestamp) return undefined;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return undefined;
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
};

const pushTag = (lines: string[], tag: string, value?: string) => {
  if (!value) return;
  const clean = sanitizeValue(value);
  if (!clean) return;
  lines.push(`${tag}  - ${clean}`);
};

export const buildRisRecord = (
  annotation: RisAnnotation,
  metadata: RisMetadata
): string => {
  const lines: string[] = [];
  lines.push(`TY  - ${metadata.referenceType || "BOOK"}`);

  pushTag(lines, "ID", annotation.id);
  pushTag(lines, "T1", metadata.title);

  const authors = splitAuthors(metadata.author);
  authors.forEach(author => pushTag(lines, "AU", author));

  pushTag(lines, "PB", metadata.publisher);

  const pageValue =
    annotation.pageNumber !== undefined
      ? String(annotation.pageNumber)
      : parsePageFromLabel(annotation.pageLabel);
  pushTag(lines, "SP", pageValue);

  if (annotation.pageLabel && !pageValue) {
    pushTag(lines, "C1", annotation.pageLabel);
  }

  pushTag(lines, "C1", annotation.chapter);
  pushTag(lines, "N1", annotation.note);
  pushTag(lines, "N2", annotation.quotedText);
  pushTag(lines, "UR", metadata.url);

  const createdDate = toRisDate(annotation.createdAt);
  pushTag(lines, "Y2", createdDate);

  lines.push("ER  -");

  return `${lines.join("\r\n")}\r\n`;
};

export const downloadAnnotationAsRis = (
  annotation: RisAnnotation,
  metadata: RisMetadata
) => {
  const ris = buildRisRecord(annotation, metadata);
  const seed =
    annotation.note || annotation.quotedText || metadata.title || "citation";
  const filename = generateFilename(`${seed}-citation`, ".ris");
  download(ris, filename, "application/x-research-info-systems");
};
