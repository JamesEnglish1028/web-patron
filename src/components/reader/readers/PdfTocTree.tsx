import * as React from "react";
import { Box } from "theme-ui";
import Button from "components/Button";
import type { PdfTocItem } from "./PdfReader.types";

export const PdfTocTree: React.FC<{
  items: PdfTocItem[];
  activePage: number;
  onSelectPage: (page?: number) => void;
  depth?: number;
}> = ({ items, activePage, onSelectPage, depth = 0 }) => {
  return (
    <>
      {items.map((item, idx) => (
        <PdfTocNode
          key={`${item.title}-${item.pageNumber || "na"}-${idx}`}
          item={item}
          activePage={activePage}
          onSelectPage={onSelectPage}
          depth={depth}
        />
      ))}
    </>
  );
};

const PdfTocNode: React.FC<{
  item: PdfTocItem;
  activePage: number;
  onSelectPage: (page?: number) => void;
  depth: number;
}> = ({ item, activePage, onSelectPage, depth }) => {
  const hasChildren = item.children.length > 0;
  const [expanded, setExpanded] = React.useState(true);
  const isActive = Boolean(item.pageNumber && item.pageNumber === activePage);
  const isHeading = !item.pageNumber && hasChildren;
  const itemFontWeight = isHeading ? 700 : depth > 0 ? 400 : 600;

  return (
    <Box>
      <Box
        as={item.pageNumber ? "button" : "div"}
        onClick={
          item.pageNumber ? () => onSelectPage(item.pageNumber) : undefined
        }
        sx={{
          appearance: "none",
          borderRadius: 8,
          border: "1px solid",
          borderColor: isActive
            ? "var(--reader-chrome-text, #0f172a)"
            : "transparent",
          background: "transparent",
          cursor: item.pageNumber ? "pointer" : "default",
          justifyContent: "space-between",
          alignItems: "flex-start",
          display: "flex",
          gap: 2,
          width: "100%",
          textAlign: "left",
          pl: 2 + depth * 3,
          pr: 2,
          py: 2,
          whiteSpace: "normal",
          minHeight: "unset",
          "&:focus,&:hover": {
            background: item.pageNumber
              ? "rgba(148, 163, 184, 0.14)"
              : "transparent",
            textDecoration: "none"
          },
          "&:active": {
            background: item.pageNumber
              ? "rgba(148, 163, 184, 0.22)"
              : "transparent"
          }
        }}
      >
        <Box
          sx={{ display: "flex", alignItems: "flex-start", gap: 2, flex: 1 }}
        >
          {hasChildren ? (
            <Button
              variant="ghost"
              color="text"
              onClick={event => {
                event.stopPropagation();
                setExpanded(prev => !prev);
              }}
              sx={{ px: 1, py: 0, minHeight: "unset", lineHeight: 1 }}
            >
              {expanded ? "▾" : "▸"}
            </Button>
          ) : (
            <Box as="span" sx={{ width: 16 }} />
          )}
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
            {item.title}
          </Box>
        </Box>
        {item.pageNumber ? (
          <Box as="span" sx={{ whiteSpace: "nowrap", opacity: 0.8 }}>
            p. {item.pageNumber}
          </Box>
        ) : (
          <span />
        )}
      </Box>
      {hasChildren && expanded && (
        <PdfTocTree
          items={item.children}
          activePage={activePage}
          onSelectPage={onSelectPage}
          depth={depth + 1}
        />
      )}
    </Box>
  );
};
