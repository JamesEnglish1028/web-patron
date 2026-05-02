import * as React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileArrowDown } from "@fortawesome/free-solid-svg-icons";

type FileDownloadProps = {
  className?: string;
  color?: string;
  style?: React.CSSProperties;
  title?: string;
  sx?: unknown;
};

const SvgFileDownload: React.FC<FileDownloadProps> = props => {
  const { sx: _sx, ...iconProps } = props;
  return <FontAwesomeIcon icon={faFileArrowDown} {...iconProps} />;
};

export default SvgFileDownload;
