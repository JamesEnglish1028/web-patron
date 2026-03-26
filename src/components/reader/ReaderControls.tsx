import * as React from "react";
import { Box } from "theme-ui";
import Button from "components/Button";
import { Text } from "components/Text";
import Stack from "components/Stack";
import ChevronLeft from "icons/ChevronLeft";
import ChevronRight from "icons/ChevronRight";

type ReaderControlsProps = {
  title?: string;
  progressLabel?: string;
  onPrev?: () => void;
  onNext?: () => void;
  onDecrease?: () => void;
  onIncrease?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  canAdjust?: boolean;
  hideAdjustControls?: boolean;
  hideNavControls?: boolean;
  centerTitle?: boolean;
  extraControls?: React.ReactNode;
  leftControls?: React.ReactNode;
};

const ReaderControls: React.FC<ReaderControlsProps> = ({
  title = "",
  progressLabel,
  onPrev,
  onNext,
  onDecrease,
  onIncrease,
  canPrev = true,
  canNext = true,
  canAdjust = true,
  hideAdjustControls = false,
  hideNavControls = false,
  centerTitle = false,
  extraControls,
  leftControls
}) => {
  const controlStack = (
    <Stack spacing={2} sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
      {!hideNavControls && (
        <>
          <Button
            variant="ghost"
            color="text"
            iconLeft={ChevronLeft}
            onClick={onPrev}
            disabled={!canPrev || !onPrev}
          >
            Prev
          </Button>
          <Button
            variant="ghost"
            color="text"
            iconLeft={ChevronRight}
            onClick={onNext}
            disabled={!canNext || !onNext}
          >
            Next
          </Button>
        </>
      )}
      {!hideAdjustControls && (
        <>
          <Button
            variant="ghost"
            color="text"
            onClick={onDecrease}
            disabled={!canAdjust || !onDecrease}
          >
            A-
          </Button>
          <Button
            variant="ghost"
            color="text"
            onClick={onIncrease}
            disabled={!canAdjust || !onIncrease}
          >
            A+
          </Button>
        </>
      )}
      {extraControls}
    </Stack>
  );

  if (!centerTitle) {
    return (
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 3,
          px: 3,
          py: 2,
          borderBottom: "1px solid",
          borderColor: "var(--reader-chrome-border, #e2e8f0)",
          position: "sticky",
          top: 0,
          zIndex: 2,
          background: "var(--reader-chrome-bg, #ffffff)",
          color: "var(--reader-chrome-text, inherit)",
          boxShadow: "0 1px 0 rgba(15, 23, 42, 0.04)"
        }}
      >
        <Box sx={{ minWidth: 200 }}>
          <Text variant="text.headers.primary">{title}</Text>
          {progressLabel && (
            <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
              {progressLabel}
            </Text>
          )}
        </Box>
        {controlStack}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 3,
        px: 3,
        py: 2,
        borderBottom: "1px solid",
        borderColor: "var(--reader-chrome-border, #e2e8f0)",
        position: "sticky",
        top: 0,
        zIndex: 2,
        background: "var(--reader-chrome-bg, #ffffff)",
        color: "var(--reader-chrome-text, inherit)",
        boxShadow: "0 1px 0 rgba(15, 23, 42, 0.04)"
      }}
    >
      <Box>{leftControls}</Box>
      <Box
        sx={{
          textAlign: "center",
          minWidth: 0,
          maxWidth: "min(50vw, 680px)",
          mx: "auto"
        }}
      >
        <Text
          variant="text.headers.primary"
          sx={{
            fontSize: "1em",
            lineHeight: 1.2,
            whiteSpace: "normal",
            overflowWrap: "anywhere",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
          title={title}
        >
          {title}
        </Text>
        {progressLabel && (
          <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
            {progressLabel}
          </Text>
        )}
      </Box>
      <Box sx={{ justifySelf: "end" }}>{controlStack}</Box>
    </Box>
  );
};

export default ReaderControls;
