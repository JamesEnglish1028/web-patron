import * as React from "react";
import Stack from "components/Stack";
import Button from "components/Button";
import List from "icons/List";
import Aa from "icons/Aa";
import Search from "icons/Search";
import Bookmark from "icons/Bookmark";
import BookmarkFilled from "icons/BookmarkFilled";
import { ThemeUIStyleObject } from "theme-ui";

type ReaderUtilityControlsProps = {
  onToggleToc?: () => void;
  onToggleTheme?: () => void;
  onToggleSearch?: () => void;
  onAddBookmark?: () => void;
  disableToc?: boolean;
  disableTheme?: boolean;
  disableSearch?: boolean;
  disableBookmark?: boolean;
  tocActive?: boolean;
  searchActive?: boolean;
  displayActive?: boolean;
  buttonColor?: string;
  tocButtonRef?: React.RefObject<HTMLButtonElement>;
  searchButtonRef?: React.RefObject<HTMLButtonElement>;
  displayButtonRef?: React.RefObject<HTMLButtonElement>;
  bookmarkActive?: boolean;
};

const ReaderUtilityControls: React.FC<ReaderUtilityControlsProps> = ({
  onToggleToc,
  onToggleTheme,
  onToggleSearch,
  onAddBookmark,
  disableToc,
  disableTheme,
  disableSearch,
  disableBookmark,
  tocActive,
  searchActive,
  displayActive,
  buttonColor = "text",
  tocButtonRef,
  searchButtonRef,
  displayButtonRef,
  bookmarkActive = false
}) => {
  const controls = [
    {
      key: "toc",
      ariaLabel: "TOC, Bookmark and Citations",
      icon: List,
      onClick: onToggleToc,
      disabled: disableToc || !onToggleToc,
      active: tocActive,
      ref: tocButtonRef
    },
    {
      key: "search",
      ariaLabel: "Search",
      icon: Search,
      onClick: onToggleSearch,
      disabled: disableSearch || !onToggleSearch,
      active: searchActive,
      ref: searchButtonRef
    },
    {
      key: "bookmark",
      ariaLabel: "Bookmark",
      icon: bookmarkActive ? BookmarkFilled : Bookmark,
      onClick: onAddBookmark,
      disabled: disableBookmark || !onAddBookmark,
      active: bookmarkActive
    },
    {
      key: "display",
      ariaLabel: "Display Settings",
      icon: Aa,
      onClick: onToggleTheme,
      disabled: disableTheme || !onToggleTheme,
      active: displayActive,
      ref: displayButtonRef
    }
  ];

  return (
    <Stack spacing={2} sx={{ flexWrap: "wrap" }}>
      {controls.map(control => (
        <Button
          key={control.key}
          variant={
            control.key === "bookmark"
              ? "ghost"
              : control.active
                ? "filled"
                : "ghost"
          }
          color={
            control.key === "bookmark"
              ? buttonColor
              : control.active
                ? "brand.primary"
                : buttonColor
          }
          iconLeft={control.icon}
          onClick={control.onClick}
          disabled={control.disabled}
          ref={control.ref}
          aria-label={control.ariaLabel}
          title={control.ariaLabel}
          sx={iconOnlyControlButtonSx}
        />
      ))}
    </Stack>
  );
};

export default ReaderUtilityControls;

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
