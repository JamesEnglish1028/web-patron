import * as React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileArrowDown } from "@fortawesome/free-solid-svg-icons";

const SvgFileDownload = (props: React.SVGProps<SVGSVGElement>) => (
  <FontAwesomeIcon icon={faFileArrowDown} {...props} />
);

export default SvgFileDownload;
