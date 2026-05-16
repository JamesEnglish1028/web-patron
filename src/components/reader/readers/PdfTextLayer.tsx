import * as React from "react";
import { Box } from "theme-ui";
import type { TextLayerData } from "./PdfReader.types";

/**
 * Renders a transparent, selectable text overlay for PDF pages.
 * Enables copy/selection and citation without requiring tagged PDFs.
 * Uses pdfjs coordinate transformation to position text accurately.
 */
export const PdfTextLayer: React.FC<{
  data: TextLayerData;
  onMouseDown?: () => void;
  onMouseUp: (event: React.MouseEvent) => void;
}> = ({ data, onMouseDown, onMouseUp }) => {
  const { items, viewportTransform, canvasWidth, canvasHeight } = data;
  const [vA, vB, vC, vD, vE, vF] = viewportTransform;
  // The PDF page coordinate system has its origin at the bottom-left with y
  // increasing upward.  The pdfjs viewport transform [vA,vB,vC,vD,vE,vF] maps
  // PDF user-space units to canvas pixels, flipping the y-axis in the process.
  // We multiply each text item's translation vector (itx, ity) by this matrix
  // to obtain canvas-pixel coordinates for the transparent span overlay.
  return (
    <Box
      role="none"
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        width: `${canvasWidth}px`,
        height: `${canvasHeight}px`,
        userSelect: "text",
        cursor: "text",
        overflow: "hidden",
        zIndex: 10,
        pointerEvents: "all"
      }}
    >
      {items.map((item, idx) => {
        if (!item.str) return null;
        const [ia, ib, , , itx, ity] = item.transform;
        // Apply the viewport's own transform matrix (accounts for viewBox
        // origin offsets and Y-flip) to get true canvas-pixel coordinates.
        const canvasX = vA * itx + vC * ity + vE;
        const canvasY = vB * itx + vD * ity + vF;
        // Font height in canvas pixels
        const fontHeight = Math.sqrt(
          (vA * ia + vC * ib) ** 2 + (vB * ia + vD * ib) ** 2
        );
        if (fontHeight <= 0) return null;
        // PDF.js DEFAULT_FONT_ASCENT ≈ 0.8
        const ascent = fontHeight * 0.8;
        const w = item.width > 0 ? Math.abs(vA * item.width) : undefined;
        return (
          <Box
            as="span"
            key={idx}
            sx={{
              position: "absolute",
              left: `${canvasX}px`,
              top: `${canvasY - ascent}px`,
              ...(w !== undefined ? { width: `${w}px` } : {}),
              height: `${fontHeight}px`,
              fontSize: `${fontHeight}px`,
              fontFamily: "sans-serif",
              whiteSpace: "pre",
              color: "transparent",
              cursor: "text",
              lineHeight: 1,
              userSelect: "text"
            }}
          >
            {item.str}
          </Box>
        );
      })}
    </Box>
  );
};
