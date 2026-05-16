import * as React from "react";
import { AspectRatio } from "@theme-ui/components";
import { MediumIcon } from "./MediumIndicator";
import { AnyBook } from "interfaces";
import LazyImage from "components/LazyImage";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook, faHeadphones } from "@fortawesome/free-solid-svg-icons";
import { faNewspaper } from "@fortawesome/free-regular-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

/**
 * This is meant to be a book cover. Primarily the image and styling,
 * along with possibly extending it to lazy load the images in the future.
 */

type ImageLoadState = "loading" | "error" | "success";

type BadgeSpec = {
  backgroundColor: string;
  badgeIcon: IconDefinition;
  placeholderIcon: IconDefinition;
};

const AUDIOBOOK_MEDIUM = "http://bib.schema.org/Audiobook";
const PERIODICAL_MEDIA = new Set([
  "http://schema.org/PublicationIssue",
  "https://schema.org/PublicationIssue",
  "http://schema.org/Periodical",
  "https://schema.org/Periodical",
  "http://schema.org/Newspaper",
  "https://schema.org/Newspaper",
  "http://schema.org/Magazine",
  "https://schema.org/Magazine"
]);

function getBadgeSpec(book: AnyBook): BadgeSpec | null {
  const medium = book.raw?.$?.["schema:additionalType"]?.value;
  if (!medium) return null;

  if (medium === AUDIOBOOK_MEDIUM) {
    return {
      // Matches the blue tone used by the Palace iOS audiobook badge.
      backgroundColor: "#00A9E0",
      badgeIcon: faHeadphones,
      placeholderIcon: faHeadphones
    };
  }

  if (PERIODICAL_MEDIA.has(medium)) {
    return {
      backgroundColor: "#F28C28",
      // Periodicals use the same corner badge icon as ebooks, with a different fill.
      badgeIcon: faBook,
      // But use a distinct placeholder icon in the cover fallback view.
      placeholderIcon: faNewspaper
    };
  }

  // Default visual treatment for books/ebooks.
  return {
    backgroundColor: "#D53F34",
    badgeIcon: faBook,
    placeholderIcon: faBook
  };
}

const BookCover: React.FC<{
  book: AnyBook;
  className?: string;
  showMedium?: boolean;
}> = ({ book, className, showMedium = false }) => {
  const [state, setState] = React.useState<ImageLoadState>("loading");
  const { imageUrl } = book;
  const badgeSpec = getBadgeSpec(book);
  const badgeIcon = badgeSpec?.badgeIcon;
  const placeholderIcon = badgeSpec?.placeholderIcon;

  const handleError = () => setState("error");
  const handleLoad = () => setState("success");

  return (
    <div
      className={className}
      sx={{
        overflow: "hidden",
        position: "relative",
        borderRadius: "card",
        "& > :first-of-type": {
          height: "100%"
        }
      }}
    >
      <AspectRatio
        ratio={2 / 3}
        sx={{
          width: "100%",
          height: "100%",
          p: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "ui.gray.lightWarm",
          borderRadius: "card"
        }}
      >
        {placeholderIcon ? (
          <FontAwesomeIcon
            icon={placeholderIcon}
            style={{ width: "30%", height: "30%", color: "#616161" }}
          />
        ) : (
          <MediumIcon
            book={book}
            sx={{ height: "30%", fill: "ui.gray.dark" }}
          />
        )}
      </AspectRatio>
      <LazyImage
        alt={`Cover for ${book.title}`}
        src={imageUrl}
        onError={handleError}
        onLoad={handleLoad}
        sx={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: state === "success" ? 1 : 0,
          transition: "all 0.1s ease-in",
          borderRadius: "card"
        }}
      />
      {showMedium && badgeIcon && (
        <div
          sx={{
            position: "absolute",
            bottom: 1,
            right: 1,
            width: "30px",
            height: "30px",
            borderRadius: "999px",
            bg: badgeSpec?.backgroundColor,
            color: "always.white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.28)"
          }}
        >
          <FontAwesomeIcon
            icon={badgeIcon}
            style={{ width: "18px", height: "18px", color: "#ffffff" }}
          />
        </div>
      )}
    </div>
  );
};

export default BookCover;
