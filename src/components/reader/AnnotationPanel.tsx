import * as React from "react";
import { Box, type ThemeUIStyleObject } from "theme-ui";
import { Text } from "components/Text";
import Button from "components/Button";
import Copy from "icons/Copy";
import FileDownload from "icons/FileDownload";
import Pencil from "icons/Pencil";
import Trash from "icons/Trash";
import ExpandMore from "icons/ExpandMore";

// Icon-only button styling
const iconOnlyControlButtonSx: ThemeUIStyleObject = {
  px: 2,
  minWidth: 44,
  "& svg": {
    width: "1.5em",
    height: "1.5em",
    mr: 0,
    ml: 0
  }
};

// Textarea styling
const textareaSx: ThemeUIStyleObject = {
  width: "100%",
  border: "1px solid",
  borderColor: "var(--reader-chrome-border, #e2e8f0)",
  borderRadius: "8px",
  p: 2,
  background: "transparent",
  color: "var(--reader-chrome-text, inherit)",
  fontFamily: "inherit",
  fontSize: "inherit",
  resize: "none",
  boxSizing: "border-box",
  transition: "height 0.2s ease"
};

export interface AnnotationItem {
  id: string;
  note: string;
  quotedText?: string;
  pageLabel?: string;
  chapter?: string;
  pageNumber?: number;
  cfi?: string;
}

const buildCitationString = (
  annotation: AnnotationItem,
  bookTitle?: string,
  bookAuthor?: string,
  bookPublisher?: string
): string => {
  const pageRef =
    annotation.pageLabel ||
    (annotation.pageNumber !== undefined
      ? `Page ${annotation.pageNumber}`
      : undefined);
  const parts = [bookTitle, bookAuthor, bookPublisher].filter(Boolean) as string[];
  const pageStr = pageRef ? ` (${pageRef})` : "";
  return parts.join(", ") + pageStr;
};

export interface AnnotationPanelProps {
  /** Whether text is currently selected for creating a citation */
  pendingAnnotationText: string | null;
  /** Current draft text for new annotation */
  annotationDraft: string;
  /** Handler for when draft text changes */
  onAnnotationDraftChange: (value: string) => void;
  /** Handler to remove pending annotation text */
  onRemovePendingAnnotationText: () => void;
  /** Handler to save new annotation */
  onAddAnnotation: () => void;
  /** List of existing annotations */
  annotations: AnnotationItem[];
  /** ID of annotation currently being edited, or null */
  editingAnnotationId: string | null;
  /** Draft text for annotation being edited */
  editingAnnotationDraft: string;
  /** Handler when editing draft changes */
  onEditingAnnotationDraftChange: (value: string) => void;
  /** Handler to enter edit mode for an annotation */
  onBeginEdit: (annotation: AnnotationItem) => void;
  /** Handler to save edited annotation */
  onSaveEdit: () => void;
  /** Handler to cancel editing */
  onCancelEdit: () => void;
  /** Handler to delete an annotation */
  onDelete: (id: string) => void;
  /** Handler to copy an annotation to clipboard */
  onCopy: (annotation: AnnotationItem) => void;
  /** Handler to download an annotation as RIS */
  onDownload?: (annotation: AnnotationItem) => void;
  /** Handler to navigate to an annotation's location */
  onNavigate?: (annotation: AnnotationItem) => void;
  /** Label for new annotation button (e.g., "Save citation" or "Save note") */
  saveButtonLabel?: string;
  /** Label for placeholder text (e.g., "Optional note..." or "Type a note") */
  draftPlaceholder?: string;
  /** Book title for rendered citation metadata */
  citationBookTitle?: string;
  /** Book author for rendered citation metadata */
  citationAuthor?: string;
  /** Book publisher for rendered citation metadata */
  citationPublisher?: string;
  /** Whether the reader is in a compact view (affects expand behavior) */
  isCompactView?: boolean;
  /** Minimum height for the textarea when not expanded */
  minTextareaHeight?: number;
  /** Maximum height for the textarea when expanded */
  maxTextareaHeight?: number;
}

export const AnnotationPanel: React.FC<AnnotationPanelProps> = ({
  pendingAnnotationText,
  annotationDraft,
  onAnnotationDraftChange,
  onRemovePendingAnnotationText,
  onAddAnnotation,
  annotations,
  editingAnnotationId,
  editingAnnotationDraft,
  onEditingAnnotationDraftChange,
  onBeginEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onCopy,
  onDownload,
  onNavigate,
  saveButtonLabel = "Save note",
  draftPlaceholder = "Type a note",
  citationBookTitle,
  citationAuthor,
  citationPublisher,
  isCompactView = false,
  minTextareaHeight = 84,
  maxTextareaHeight = 300
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const textareaHeight = isExpanded ? maxTextareaHeight : minTextareaHeight;
  const showExpandToggle = !isCompactView;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        flex: 1,
        minHeight: 0,
        overflow: "auto"
      }}
    >
      {/* Pending Citation Text Display */}
      {pendingAnnotationText && (
        <Box
          sx={{
            borderLeft: "3px solid",
            borderColor: "ui.gray.medium",
            pl: 2,
            py: 1,
            background: "rgba(0,0,0,0.03)",
            borderRadius: "0 4px 4px 0"
          }}
        >
          <Text variant="text.detail" sx={{ color: "ui.gray.dark", mb: 1 }}>
            Selected text:
          </Text>
          <Text variant="text.detail" sx={{ fontStyle: "italic", mb: 1 }}>
            &ldquo;{pendingAnnotationText}&rdquo;
          </Text>
          <Button
            variant="ghost"
            color="text"
            onClick={onRemovePendingAnnotationText}
          >
            Remove
          </Button>
        </Box>
      )}

      {/* Annotation Creation Form */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2
          }}
        >
          <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
            {pendingAnnotationText
              ? "Add an optional note"
              : "Add a note for the current location"}
          </Text>
          {showExpandToggle && (
            <Button
              variant="ghost"
              color="text"
              iconLeft={ExpandMore}
              onClick={() => setIsExpanded(prev => !prev)}
              aria-label={isExpanded ? "Collapse note area" : "Expand note area"}
              title={isExpanded ? "Collapse" : "Expand"}
              sx={{
                ...iconOnlyControlButtonSx,
                "& svg": {
                  ...iconOnlyControlButtonSx["& svg"],
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease"
                }
              }}
            />
          )}
        </Box>

        <Box
          as="textarea"
          value={annotationDraft}
          onChange={e => onAnnotationDraftChange((e.target as HTMLTextAreaElement).value)}
          placeholder={
            pendingAnnotationText ? "Optional note..." : draftPlaceholder
          }
          sx={{
            ...textareaSx,
            height: `${textareaHeight}px`
          }}
        />

        <Box>
          <Button variant="ghost" color="text" onClick={onAddAnnotation}>
            {pendingAnnotationText ? "Save citation" : saveButtonLabel}
          </Button>
        </Box>
      </Box>

      {/* Annotations List */}
      {annotations.length > 0 ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
            pr: 1
          }}
        >
          {annotations.map(annotation => (
            <Box
              key={annotation.id}
              sx={{
                border: "1px solid",
                borderColor: "var(--reader-chrome-border, #e2e8f0)",
                borderRadius: 8,
                p: 2
              }}
            >
              {/* Annotation Header with Location and Controls */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                  mb: annotation.note || annotation.quotedText ? 1 : 0
                }}
              >
                <Button
                  variant="ghost"
                  color="text"
                  onClick={() => {
                    if (onNavigate) {
                      onNavigate(annotation);
                    }
                  }}
                >
                  {annotation.chapter ||
                    annotation.pageLabel ||
                    (annotation.pageNumber !== undefined
                      ? `Page ${annotation.pageNumber}`
                      : "Annotation")}
                </Button>
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <Button
                    variant="ghost"
                    color="text"
                    iconLeft={Pencil}
                    aria-label="Edit"
                    title="Edit"
                    onClick={() => onBeginEdit(annotation)}
                    sx={iconOnlyControlButtonSx}
                  />
                  <Button
                    variant="ghost"
                    color="text"
                    iconLeft={Copy}
                    aria-label="Copy"
                    title="Copy"
                    onClick={() => onCopy(annotation)}
                    sx={iconOnlyControlButtonSx}
                  />
                  {onDownload && (
                    <Button
                      variant="ghost"
                      color="text"
                      iconLeft={FileDownload}
                      aria-label="Download RIS"
                      title="Download RIS"
                      onClick={() => onDownload(annotation)}
                      sx={iconOnlyControlButtonSx}
                    />
                  )}
                  <Button
                    variant="ghost"
                    color="text"
                    iconLeft={Trash}
                    aria-label="Delete"
                    title="Delete"
                    onClick={() => onDelete(annotation.id)}
                    sx={iconOnlyControlButtonSx}
                  />
                </Box>
              </Box>

              {/* Edit Mode or Display Mode */}
              {editingAnnotationId === annotation.id ? (
                <>
                  {annotation.quotedText && (
                    <Box
                      sx={{
                        borderLeft: "3px solid",
                        borderColor: "ui.gray.medium",
                        pl: 2,
                        mb: 2,
                        fontStyle: "italic"
                      }}
                    >
                      <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
                        &ldquo;{annotation.quotedText}&rdquo;
                      </Text>
                    </Box>
                  )}
                  <Text variant="text.detail" sx={{ color: "ui.gray.dark", mb: 1 }}>
                    Note
                  </Text>
                  <Box
                    as="textarea"
                    value={editingAnnotationDraft}
                    onChange={e =>
                      onEditingAnnotationDraftChange((e.target as HTMLTextAreaElement).value)
                    }
                    sx={{
                      ...textareaSx,
                      height: `${minTextareaHeight}px`,
                      mb: 2
                    }}
                    title="Edit annotation note"
                  />
                  {buildCitationString(
                    annotation,
                    citationBookTitle,
                    citationAuthor,
                    citationPublisher
                  ) && (
                    <Box
                      sx={{
                        border: "1px solid",
                        borderColor: "var(--reader-chrome-border, #e2e8f0)",
                        borderRadius: 8,
                        p: 2,
                        mb: 2,
                        background: "rgba(0,0,0,0.02)"
                      }}
                    >
                      <Text variant="text.detail" sx={{ color: "ui.gray.dark" }}>
                        <Text as="span" sx={{ fontWeight: "bold" }}>Citation:</Text>
                        {" "}
                        {`${citationBookTitle}, ${citationAuthor}, ${citationPublisher}${annotation.pageLabel || annotation.pageNumber !== undefined ? ` (${annotation.pageLabel || `Page ${annotation.pageNumber}`})` : ""}`}
                      </Text>
                    </Box>
                  )}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Button
                      variant="ghost"
                      color="text"
                      onClick={onSaveEdit}
                      disabled={!editingAnnotationDraft.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      color="text"
                      onClick={onCancelEdit}
                    >
                      Cancel
                    </Button>
                  </Box>
                </>
              ) : (
                <>
                  {/* Display Quoted Text */}
                  {annotation.quotedText && (
                    <Box
                      sx={{
                        borderLeft: "3px solid",
                        borderColor: "ui.gray.medium",
                        pl: 2,
                        mb: 1,
                        fontStyle: "italic"
                      }}
                    >
                      <Text
                        variant="text.detail"
                        sx={{ color: "ui.gray.dark" }}
                      >
                        &ldquo;{annotation.quotedText}&rdquo;
                      </Text>
                    </Box>
                  )}

                  {/* Display Note */}
                  {annotation.note && (
                    <Text variant="text.detail" sx={{ mb: 2 }}>
                      {annotation.note}
                    </Text>
                  )}

                  {/* Display Page/Chapter Label */}
                  {annotation.pageLabel && (
                    <Text
                      variant="text.detail"
                      sx={{ color: "ui.gray.dark", mb: 2 }}
                    >
                      {annotation.pageLabel}
                    </Text>
                  )}
                </>
              )}
            </Box>
          ))}
        </Box>
      ) : (
        <Text variant="text.detail">No annotations yet.</Text>
      )}
    </Box>
  );
};

export default AnnotationPanel;
