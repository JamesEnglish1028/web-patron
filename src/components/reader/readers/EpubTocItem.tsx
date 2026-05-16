import * as React from "react";
import { Box } from "theme-ui";
import type { EpubTocItem as EpubTocItemType } from "./EpubReader.types";

/**
 * Helper to compare EPUB TOC href paths for active state detection.
 */
const tocHrefMatches = (
  a: string,
  b: string,
  helpers?: {
    cleanPath: (p: string) => string;
    splitHref: (h: string) => { path: string };
    safeDecode: (s: string) => string;
  }
): boolean => {
  if (!helpers) {
    // Fallback simple comparison when utilities aren't provided
    return a === b;
  }
  const { cleanPath, splitHref, safeDecode } = helpers;
  const aPath = cleanPath(splitHref(safeDecode(a)).path);
  const bPath = cleanPath(splitHref(safeDecode(b)).path);
  return aPath === bPath;
};

type PathHelpers = {
  cleanPath: (p: string) => string;
  splitHref: (h: string) => { path: string };
  safeDecode: (s: string) => string;
};

/**
 * Individual EPUB TOC item row with expand/collapse and navigation.
 * Recursively renders child items when expanded.
 */
export const EpubTocItem: React.FC<{
  item: EpubTocItemType;
  depth: number;
  onSelect: (href: string) => void;
  activeHref?: string;
  parentHref?: string;
  pathHelpers?: PathHelpers;
}> = ({ item, depth, onSelect, activeHref, parentHref, pathHelpers }) => {
  const [expanded, setExpanded] = React.useState(depth < 1);
  const label = item?.label || item?.title || "Untitled";
  const href = typeof item?.href === "string" ? item.href : "";
  const rawSubitems = Array.isArray(item?.subitems) ? item.subitems : [];
  // Deduplicate: skip child items whose href is identical to the parent's href
  // — some EPUBs repeat the section link as the first child, causing a visual
  // duplicate when the parent is expanded.
  const subitems = parentHref
    ? rawSubitems.filter(
        child =>
          !(
            typeof child?.href === "string" &&
            tocHrefMatches(child.href, parentHref, pathHelpers)
          )
      )
    : rawSubitems;
  const hasChildren = subitems.length > 0;
  const pageNumber =
    typeof item?.pageNumber === "number" && Number.isFinite(item.pageNumber)
      ? Math.max(1, Math.round(item.pageNumber))
      : undefined;
  const locationIndex =
    typeof item?.locationIndex === "number" &&
    Number.isFinite(item.locationIndex)
      ? Math.max(1, Math.round(item.locationIndex))
      : undefined;
  const isActive =
    href && activeHref ? tocHrefMatches(href, activeHref, pathHelpers) : false;
  const isHeading = !href && hasChildren;
  const itemFontWeight = isHeading ? 700 : depth > 0 ? 400 : 600;

  // Row: expand chevron + label are sibling elements (never nested buttons).
  // Having a <button> inside a <button> is invalid HTML — the browser promotes
  // the inner one, which broke expand and navigation for nested TOC items.
  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          pl: 2 + depth * 3,
          pr: 2
        }}
      >
        {/* Expand / collapse chevron — only shown when there are children */}
        {hasChildren ? (
          <Box
            as="button"
            onClick={() => setExpanded(prev => !prev)}
            aria-label={expanded ? "Collapse" : "Expand"}
            sx={{
              appearance: "none",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              px: 1,
              py: 2,
              lineHeight: 1,
              flexShrink: 0,
              color: "var(--reader-chrome-text, inherit)",
              "&:focus,&:hover": { opacity: 0.7 }
            }}
          >
            {expanded ? "▾" : "▸"}
          </Box>
        ) : (
          <Box as="span" sx={{ width: 20, flexShrink: 0 }} />
        )}

        {/* Navigation label — its own button, never a parent of another button */}
        <Box
          as={href ? "button" : "div"}
          onClick={href ? () => onSelect(href) : undefined}
          sx={{
            appearance: "none",
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "flex-start",
            gap: 2,
            background: "transparent",
            borderRadius: 8,
            border: "1px solid",
            borderColor: isActive
              ? "var(--reader-chrome-text, #0f172a)"
              : "transparent",
            cursor: href ? "pointer" : "default",
            textAlign: "left",
            py: 2,
            pr: 1,
            color: "var(--reader-chrome-text, inherit)",
            "&:focus,&:hover": {
              background: href ? "rgba(148, 163, 184, 0.14)" : "transparent",
              textDecoration: "none"
            },
            "&:active": {
              background: href ? "rgba(148, 163, 184, 0.22)" : "transparent"
            }
          }}
        >
          <Box
            as="span"
            sx={{
              flex: 1,
              minWidth: 0,
              overflowWrap: "anywhere",
              lineHeight: 1.25,
              fontWeight: itemFontWeight
            }}
          >
            {label}
          </Box>
          {pageNumber ? (
            <Box as="span" sx={{ whiteSpace: "nowrap", opacity: 0.8 }}>
              p. {pageNumber}
            </Box>
          ) : locationIndex ? (
            <Box as="span" sx={{ whiteSpace: "nowrap", opacity: 0.7 }}>
              loc. {locationIndex}
            </Box>
          ) : (
            <span />
          )}
        </Box>
      </Box>

      {hasChildren && expanded && (
        <Box>
          {subitems.map((child: EpubTocItemType, index: number) => (
            <EpubTocItem
              key={
                child?.id ||
                child?.href ||
                `${child?.label || child?.title}-${index}`
              }
              item={child}
              depth={depth + 1}
              onSelect={onSelect}
              activeHref={activeHref}
              parentHref={href || parentHref}
              pathHelpers={pathHelpers}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};
