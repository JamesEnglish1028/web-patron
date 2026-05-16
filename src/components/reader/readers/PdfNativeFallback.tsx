import * as React from "react";
import { Box } from "theme-ui";
import Button, { AnchorButton } from "components/Button";
import Stack from "components/Stack";
import { Text } from "components/Text";
import ReaderControls from "../ReaderControls";
import ReaderUtilityControls from "../ReaderUtilityControls";

type PdfNativeFallbackProps = {
  title: string;
  pdfUrl: string;
  nativeViewerSrc: string;
  tocActive: boolean;
  searchActive: boolean;
  displayActive: boolean;
  setTocActive: (value: boolean | ((prev: boolean) => boolean)) => void;
  setSearchActive: (value: boolean | ((prev: boolean) => boolean)) => void;
  setDisplayActive: (value: boolean | ((prev: boolean) => boolean)) => void;
  leftControls: React.ReactNode;
};

/**
 * Fallback PDF reader component using native browser PDF viewer.
 * Rendered when custom canvas rendering is unavailable.
 */
export const PdfNativeFallback: React.FC<PdfNativeFallbackProps> = ({
  title,
  pdfUrl,
  nativeViewerSrc,
  tocActive,
  searchActive,
  displayActive,
  setTocActive,
  setSearchActive,
  setDisplayActive,
  leftControls
}) => {
  return (
    <Box
      sx={{
        flex: 1,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <ReaderControls
        title={title || ""}
        centerTitle
        canPrev={false}
        canNext={false}
        canAdjust={false}
        hideNavControls
        hideAdjustControls
        leftControls={leftControls}
        extraControls={
          <ReaderUtilityControls
            onToggleToc={() => setTocActive(prev => !prev)}
            onToggleSearch={() => setSearchActive(prev => !prev)}
            onToggleTheme={() => setDisplayActive(prev => !prev)}
            disableBookmark
            tocActive={tocActive}
            searchActive={searchActive}
            displayActive={displayActive}
          />
        }
      />
      <Box
        sx={{
          flex: 1,
          minHeight: "70vh",
          overflow: "hidden",
          px: { _: 2, md: 3 },
          py: 3,
          background:
            "linear-gradient(180deg, rgba(241,245,249,0.96) 0%, rgba(226,232,240,0.9) 100%)"
        }}
      >
        <Box
          sx={{
            maxWidth: 1200,
            mx: "auto",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 3
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 3,
              px: 3,
              py: 3,
              borderRadius: 14,
              border: "1px solid rgba(148, 163, 184, 0.28)",
              background: "rgba(255,255,255,0.82)",
              boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)"
            }}
          >
            <Box>
              <Text variant="text.headers.primary">PDF Reader</Text>
              <Text variant="text.detail" sx={{ color: "ui.gray.dark", mt: 1 }}>
                This title is using compatibility mode because custom canvas
                rendering is unavailable in this browser/runtime.
              </Text>
            </Box>
            <Stack spacing={2} sx={{ flexWrap: "wrap" }}>
              <AnchorButton
                href={pdfUrl || undefined}
                newTab
                variant="ghost"
                color="text"
              >
                Open in New Tab
              </AnchorButton>
              <AnchorButton
                href={pdfUrl || undefined}
                download={title ? `${title}.pdf` : "book.pdf"}
                variant="filled"
                color="brand.primary"
              >
                Download PDF
              </AnchorButton>
            </Stack>
          </Box>
          <Box
            sx={{
              flex: 1,
              minHeight: "64vh",
              borderRadius: 18,
              overflow: "hidden",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              background: "#cbd5e1",
              boxShadow: "0 18px 40px rgba(15, 23, 42, 0.16)",
              position: "relative"
            }}
          >
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at top, rgba(255,255,255,0.35), transparent 48%)",
                pointerEvents: "none",
                zIndex: 1
              }}
            />
            <iframe
              src={nativeViewerSrc || undefined}
              title={title || "PDF reader"}
              width="100%"
              height="100%"
              frameBorder={0}
            />
          </Box>
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 2,
              px: 3,
              py: 2,
              borderRadius: 12,
              background: "rgba(255,255,255,0.74)",
              border: "1px solid rgba(148, 163, 184, 0.22)"
            }}
          >
            <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
              Patron Web provides styled reader chrome while this compatibility
              mode delegates rendering to the browser PDF surface.
            </Text>
            <Button
              variant="ghost"
              color="text"
              onClick={() =>
                window.open(
                  pdfUrl || undefined,
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              Pop Out Reader
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
