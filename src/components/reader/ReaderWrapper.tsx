import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Dialog, DialogDismiss } from "@ariakit/react";
import Button from "components/Button";
import LoadingIndicator from "components/LoadingIndicator";
import { Box, Container } from "theme-ui";
import ChevronLeft from "icons/ChevronLeft";
import { Text } from "components/Text";
import Stack from "components/Stack";

export type ReaderBookInfo = {
  title?: string;
  author?: string;
  publisher?: string;
  published?: string;
  identifier?: string;
  rights?: string;
  accessibility?: string;
  accessMode?: string;
  accessModeSufficient?: string;
  accessibilityFeature?: string;
  accessibilityHazard?: string;
  accessibilityCertification?: string;
  accessibilityConformsTo?: string;
  modified?: string;
  description?: string;
  language?: string;
  subjects?: string;
  coverUrl?: string;
};

type ReaderInfoContextValue = {
  bookInfo: ReaderBookInfo | null;
  setBookInfo: (info: ReaderBookInfo) => void;
  showInfo: boolean;
  toggleInfo: () => void;
  infoButtonRef: React.RefObject<HTMLButtonElement | null>;
  backControl: React.ReactNode;
};

const ReaderInfoContext = React.createContext<ReaderInfoContextValue | null>(
  null
);

export const useReaderInfo = () => React.useContext(ReaderInfoContext);

interface ReaderWrapperProps {
  children: (args: {
    loading: boolean;
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  }) => React.ReactNode;
}

const ReaderWrapper = ({ children }: ReaderWrapperProps) => {
  const { back } = useRouter();
  const close = () => back();

  const [loading, setLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [bookInfo, setBookInfo] = useState<ReaderBookInfo | null>(null);
  const infoPanelRef = React.useRef<HTMLDivElement | null>(null);
  const infoButtonRef = React.useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!showInfo) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || !infoPanelRef.current) return;
      if (
        infoPanelRef.current.contains(target) ||
        infoButtonRef.current?.contains(target)
      ) {
        return;
      }
      setShowInfo(false);
      infoButtonRef.current?.blur();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showInfo]);

  const accessibilityRows = useMemo(
    () =>
      [
        { label: "Accessibility", value: bookInfo?.accessibility },
        { label: "Access mode", value: bookInfo?.accessMode },
        { label: "Access mode sufficient", value: bookInfo?.accessModeSufficient },
        { label: "Accessibility features", value: bookInfo?.accessibilityFeature },
        { label: "Accessibility hazards", value: bookInfo?.accessibilityHazard },
        { label: "Accessibility certification", value: bookInfo?.accessibilityCertification },
        { label: "Accessibility conforms to", value: bookInfo?.accessibilityConformsTo }
      ].filter(item => item.value),
    [bookInfo]
  );

  const infoRows = useMemo(
    () =>
      [
        { label: "Publication date", value: bookInfo?.published },
        { label: "Last modified", value: bookInfo?.modified },
        { label: "Subjects", value: bookInfo?.subjects },
        { label: "Description", value: bookInfo?.description }
      ].filter(item => item.value),
    [bookInfo]
  );

  const toggleInfo = () =>
    setShowInfo(prev => {
      const next = !prev;
      if (prev) infoButtonRef.current?.blur();
      return next;
    });

  const backControl = (
    <DialogDismiss
      render={
        <Button variant="ghost" color="text" iconLeft={ChevronLeft} size="sm">
          Back
        </Button>
      }
    />
  );

  return (
    <Dialog
      open
      onClose={close}
      portal={false}
      sx={{
        position: "fixed",
        top: 0,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100%",
        background: "var(--reader-chrome-bg, #ffffff)",
        color: "var(--reader-chrome-text, inherit)"
      }}
    >
      <ReaderInfoContext.Provider
        value={{ bookInfo, setBookInfo, showInfo, toggleInfo, infoButtonRef, backControl }}
      >
        {showInfo && (
          <Box
            ref={infoPanelRef}
            sx={{
              position: "absolute",
              top: 70,
              left: 16,
              width: "24vw",
              minWidth: 240,
              maxWidth: 360,
              maxHeight: "82vh",
              overflowY: "auto",
              background: "var(--reader-chrome-bg, #ffffff)",
              border: "1px solid",
              borderColor: "var(--reader-chrome-border, #e2e8f0)",
              borderRadius: 10,
              boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
              px: 3,
              py: 3,
              zIndex: 5
            }}
          >
            <Stack spacing={3} direction="column">
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  alignItems: "center",
                  textAlign: "center"
                }}
              >
                {bookInfo?.coverUrl && (
                  <Box
                    as="img"
                    src={bookInfo.coverUrl}
                    alt={bookInfo.title || "Book cover"}
                    sx={{
                      width: 120,
                      height: 160,
                      objectFit: "cover",
                      borderRadius: 8,
                      boxShadow: "0 6px 18px rgba(15, 23, 42, 0.15)"
                    }}
                  />
                )}
                <Text variant="text.headers.primary" sx={{ fontSize: "1.25rem" }}>
                  {bookInfo?.title || "Book details"}
                </Text>
                {bookInfo?.author && (
                  <Text variant="text.body.regular">{bookInfo.author}</Text>
                )}
              </Box>
              {(bookInfo?.publisher ||
                bookInfo?.identifier ||
                bookInfo?.language ||
                bookInfo?.rights) && (
                <Box
                  sx={{
                    borderTop: "1px solid",
                    borderColor: "var(--reader-chrome-border, #e2e8f0)",
                    pt: 2,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    textAlign: "center"
                  }}
                >
                  {bookInfo?.publisher && (
                    <Text
                      variant="text.detail"
                      sx={{ opacity: 0.8, fontSize: "0.85rem" }}
                    >
                      Publisher: {bookInfo.publisher}
                    </Text>
                  )}
                  {bookInfo?.identifier && (
                    <Text
                      variant="text.detail"
                      sx={{ opacity: 0.8, fontSize: "0.85rem" }}
                    >
                      ISBN/ID: {bookInfo.identifier}
                    </Text>
                  )}
                  {bookInfo?.language && (
                    <Text
                      variant="text.detail"
                      sx={{ opacity: 0.8, fontSize: "0.85rem" }}
                    >
                      Language: {bookInfo.language}
                    </Text>
                  )}
                  {bookInfo?.rights && (
                    <Text
                      variant="text.detail"
                      sx={{ opacity: 0.8, fontSize: "0.85rem" }}
                    >
                      Rights: {bookInfo.rights}
                    </Text>
                  )}
                </Box>
              )}
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  textAlign: "center",
                  pt: 3
                }}
              >
                <Text
                  variant="text.detail"
                  sx={{
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 600,
                    opacity: 0.8,
                    fontSize: "0.75rem"
                  }}
                >
                  Accessibility
                </Text>
                <Box
                  sx={{
                    borderTop: "1px solid",
                    borderColor: "var(--reader-chrome-border, #e2e8f0)",
                    pt: 2,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1
                  }}
                >
                  {accessibilityRows.length > 0 ? (
                    accessibilityRows.map(row => (
                      <Text
                        key={row.label}
                        variant="text.detail"
                        sx={{ fontSize: "0.8rem" }}
                      >
                        {row.label}: {row.value}
                      </Text>
                    ))
                  ) : (
                    <Text variant="text.detail" sx={{ fontSize: "0.8rem" }}>
                      Unreported
                    </Text>
                  )}
                </Box>
              </Box>
              {infoRows.length > 0 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {infoRows.map(row => (
                    <Box
                      key={row.label}
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                        textAlign: "center"
                      }}
                    >
                      <Text
                        variant="text.detail"
                        sx={{
                          color: "var(--reader-chrome-text, inherit)",
                          opacity: 0.7
                        }}
                      >
                        {row.label}
                      </Text>
                      <Text sx={{ wordBreak: "break-word" }}>{row.value}</Text>
                    </Box>
                  ))}
                </Box>
              )}
            </Stack>
          </Box>
        )}
        <Box sx={{ position: "relative", flex: 1, minHeight: 0 }}>
        {loading && (
          <Container
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              pointerEvents: "none",
              background: "rgba(255,255,255,0.6)",
              zIndex: 3
            }}
          >
            <LoadingIndicator />
          </Container>
        )}
        {children({ loading, setLoading })}
        </Box>
      </ReaderInfoContext.Provider>
    </Dialog>
  );
};

export default ReaderWrapper;
