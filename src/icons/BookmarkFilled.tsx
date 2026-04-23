import * as React from "react";

const BookmarkFilled: React.FC<React.SVGProps<SVGSVGElement>> = props => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    {...props}
  >
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
  </svg>
);

export default BookmarkFilled;
