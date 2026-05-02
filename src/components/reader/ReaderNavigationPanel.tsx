import * as React from "react";
import { Box, type ThemeUIStyleObject } from "theme-ui";
import Button from "components/Button";
import ExternalOpen from "icons/ExternalOpen";

export type ReaderNavTabKey = "toc" | "bookmarks" | "annotations";

type ReaderNavigationPanelProps = {
  activeTab: ReaderNavTabKey;
  onTabChange: (tab: ReaderNavTabKey) => void;
  tocContent: React.ReactNode;
  bookmarksContent: React.ReactNode;
  annotationsContent: React.ReactNode;
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  top?: number;
  right?: number;
  zIndex?: number;
  panelSx?: ThemeUIStyleObject;
  storageKey?: string;
};

type StoredPanelState = {
  width: number;
  expanded: boolean;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const iconOnlyControlButtonSx: ThemeUIStyleObject = {
  px: 2,
  minWidth: 44,
  "& svg": {
    width: "1.25em",
    height: "1.25em",
    mr: 0,
    ml: 0
  }
};

const ReaderNavigationPanel: React.FC<ReaderNavigationPanelProps> = ({
  activeTab,
  onTabChange,
  tocContent,
  bookmarksContent,
  annotationsContent,
  initialWidth = 380,
  minWidth = 320,
  maxWidth = 760,
  top = 64,
  right = 16,
  zIndex = 6,
  panelSx,
  storageKey
}) => {
  const [panelWidth, setPanelWidth] = React.useState(initialWidth);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const resizeStateRef = React.useRef<"edge" | "corner" | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const storageStateKey = React.useMemo(
    () => (storageKey ? `reader.navigationPanel.${storageKey}` : null),
    [storageKey]
  );

  const getViewportSize = () => {
    const parentRect = panelRef.current?.parentElement?.getBoundingClientRect();
    return {
      width: parentRect?.width ?? window.innerWidth,
      height: parentRect?.height ?? window.innerHeight
    };
  };

  const startResize =
    (mode: "edge" | "corner") => (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      resizeStateRef.current = mode;
      document.body.style.cursor = "ew-resize";
    };

  const toggleExpandedWidth = () => {
    if (isExpanded) {
      setPanelWidth(clamp(initialWidth, minWidth, maxWidth));
      setIsExpanded(false);
      return;
    }

    const viewport = getViewportSize();
    const targetWidth = Math.max(minWidth, viewport.width * 0.5);
    const availableWidth = Math.max(minWidth, viewport.width - right * 2);
    setPanelWidth(Math.min(targetWidth, availableWidth));
    setIsExpanded(true);
  };

  React.useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!resizeStateRef.current) return;
      const nextWidth = window.innerWidth - event.clientX - right;
      const clamped = clamp(nextWidth, minWidth, maxWidth);
      setPanelWidth(clamped);
      setIsExpanded(false);
    };

    const onMouseUp = () => {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
    };
  }, [initialWidth, maxWidth, minWidth, right]);

  React.useEffect(() => {
    if (!isExpanded) return;

    const onResize = () => {
      const viewport = getViewportSize();
      const targetWidth = Math.max(minWidth, viewport.width * 0.5);
      const availableWidth = Math.max(minWidth, viewport.width - right * 2);
      setPanelWidth(Math.min(targetWidth, availableWidth));
    };

    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isExpanded, minWidth, right]);

  React.useEffect(() => {
    if (!storageStateKey) return;

    try {
      const raw = window.localStorage.getItem(storageStateKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredPanelState;
      const restoredWidth =
        typeof parsed.width === "number"
          ? clamp(parsed.width, minWidth, maxWidth)
          : clamp(initialWidth, minWidth, maxWidth);
      setPanelWidth(restoredWidth);
      setIsExpanded(Boolean(parsed.expanded));
    } catch {
      // Ignore invalid persisted panel state.
    }
  }, [initialWidth, maxWidth, minWidth, storageStateKey]);

  React.useEffect(() => {
    if (!storageStateKey) return;

    const payload: StoredPanelState = {
      width: panelWidth,
      expanded: isExpanded
    };
    try {
      window.localStorage.setItem(storageStateKey, JSON.stringify(payload));
    } catch {
      // Ignore storage write failures.
    }
  }, [isExpanded, panelWidth, storageStateKey]);

  return (
    <Box
      ref={panelRef}
      sx={{
        position: "absolute",
        top,
        right,
        width: `${panelWidth}px`,
        maxWidth: `calc(100vw - ${right * 2}px)`,
        height: isExpanded ? `calc(100% - ${top + 8}px)` : "auto",
        maxHeight: isExpanded ? "none" : "70vh",
        overflow: "hidden",
        border: "1px solid",
        borderColor: "var(--reader-chrome-border, #e2e8f0)",
        borderRadius: 10,
        background: "var(--reader-chrome-bg, #ffffff)",
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
        zIndex,
        p: 2,
        display: "flex",
        flexDirection: "column",
        ...panelSx
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          mb: 2,
          flexShrink: 0
        }}
      >
        <Box sx={{ display: "flex", gap: 2 }}>
          {(
            [
              { key: "toc", label: "TOC" },
              { key: "bookmarks", label: "Bookmarks" },
              { key: "annotations", label: "Annotations" }
            ] as const
          ).map(tab => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? "filled" : "ghost"}
              color="text"
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </Box>
        <Button
          variant="ghost"
          color="text"
          iconLeft={ExternalOpen}
          aria-label={isExpanded ? "Restore panel width" : "Expand panel width"}
          title={isExpanded ? "Restore width" : "Expand to 50% width"}
          onClick={toggleExpandedWidth}
          sx={{
            ...iconOnlyControlButtonSx,
            "& svg": {
              width: "1.25em",
              height: "1.25em",
              mr: 0,
              ml: 0,
              transform: isExpanded ? "rotate(180deg)" : "none",
              transition: "transform 0.2s ease"
            }
          }}
        />
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}>
        {activeTab === "toc" && tocContent}
        {activeTab === "bookmarks" && bookmarksContent}
        {activeTab === "annotations" && annotationsContent}
      </Box>

      <Box
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize navigation panel"
        onMouseDown={startResize("edge")}
        sx={{
          position: "absolute",
          top: 0,
          left: -6,
          width: 12,
          height: "100%",
          cursor: "ew-resize",
          zIndex: 2
        }}
      />

      <Box
        role="button"
        tabIndex={0}
        aria-label="Resize panel from corner"
        title="Drag to resize. Double-click to expand to 2x width."
        onMouseDown={startResize("corner")}
        onDoubleClick={toggleExpandedWidth}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleExpandedWidth();
          }
        }}
        sx={{
          position: "absolute",
          left: -2,
          bottom: -2,
          width: 16,
          height: 16,
          borderRadius: 3,
          cursor: "ew-resize",
          background: "var(--reader-chrome-border, #cbd5e1)",
          opacity: 0.9,
          zIndex: 3
        }}
      />
    </Box>
  );
};

export default ReaderNavigationPanel;
