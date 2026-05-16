import * as React from "react";
import { Text } from "./Text";
import { bookMediumMap, getMedium } from "utils/book";
import { AnyBook } from "interfaces";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook, faHeadphones } from "@fortawesome/free-solid-svg-icons";
import { faNewspaper } from "@fortawesome/free-regular-svg-icons";
import { SxProp } from "theme-ui";

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

const AUDIOBOOK_MEDIUM = "http://bib.schema.org/Audiobook";

const MediumIndicator: React.FC<{ book: AnyBook; className?: string }> = ({
  book,
  className
}) => {
  const medium = getMedium(book);

  if (Object.keys(bookMediumMap).indexOf(medium) === -1) return null;
  if (medium === "") return null;
  const mediumInfo = bookMediumMap[medium];
  return (
    <Text sx={{ display: "flex", alignItems: "center" }} className={className}>
      <MediumIcon sx={{ mr: 1 }} book={book} />
      {mediumInfo.name}
    </Text>
  );
};

export default MediumIndicator;

export const MediumIcon: React.FC<{
  book: AnyBook;
  className?: string;
  sx?: SxProp;
}> = ({ book, className, sx, ...rest }) => {
  const medium = getMedium(book);

  if (medium === "") return null;

  const icon =
    medium === AUDIOBOOK_MEDIUM
      ? faHeadphones
      : PERIODICAL_MEDIA.has(medium)
        ? faNewspaper
        : medium in bookMediumMap
          ? faBook
          : null;

  if (!icon) return null;

  return (
    <span
      className={className}
      sx={{ display: "inline-flex", alignItems: "center", ...(sx as object) }}
    >
      <FontAwesomeIcon
        icon={icon}
        aria-hidden="true"
        style={{ width: "1em", height: "1em" }}
        {...rest}
      />
    </span>
  );
};
