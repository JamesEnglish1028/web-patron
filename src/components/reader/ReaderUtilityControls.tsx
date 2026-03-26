import * as React from "react";
import Stack from "components/Stack";
import Button from "components/Button";
import List from "icons/List";
import Settings from "icons/Settings";
import Search from "icons/Search";
import Bookmark from "icons/Bookmark";

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
  displayButtonRef
}) => {
  const controls = [
    {
      key: "toc",
      label: "TOC",
      icon: List,
      onClick: onToggleToc,
      disabled: disableToc || !onToggleToc,
      active: tocActive,
      ref: tocButtonRef
    },
    {
      key: "search",
      label: "Search",
      icon: Search,
      onClick: onToggleSearch,
      disabled: disableSearch || !onToggleSearch,
      active: searchActive,
      ref: searchButtonRef
    },
    {
      key: "bookmark",
      label: "Bookmark",
      icon: Bookmark,
      onClick: onAddBookmark,
      disabled: disableBookmark || !onAddBookmark,
      active: false
    },
    {
      key: "display",
      label: "Display",
      icon: Settings,
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
          variant={control.active ? "filled" : "ghost"}
          color={buttonColor}
          iconLeft={control.icon}
          onClick={control.onClick}
          disabled={control.disabled}
          ref={control.ref}
        >
          {control.label}
        </Button>
      ))}
    </Stack>
  );
};

export default ReaderUtilityControls;
