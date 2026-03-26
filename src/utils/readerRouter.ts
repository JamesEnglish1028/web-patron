import type {
  AcquisitionLink,
  ReaderAction,
  ReaderRouterOptions
} from "@thepalaceproject/reader";
import { resolveReaderAction } from "@thepalaceproject/reader";
import type { FulfillmentLink } from "interfaces";

const parseContentType = (
  raw: string | undefined | null
): { type: string; profile: string } => {
  if (!raw) return { type: "", profile: "" };
  const normalized = raw.toLowerCase();
  const [media, ...params] = normalized.split(";");
  const profileParam = params
    .map(part => part.trim())
    .find(part => part.startsWith("profile="));
  const profile = profileParam ? profileParam.replace(/^profile=("|')?/, "").replace(/("|')?$/, "") : "";
  return { type: media.trim(), profile };
};

const fulfillmentToAcquisitionLink = (
  link: FulfillmentLink
): AcquisitionLink => {
  const { type, profile } = parseContentType(link.contentType);
  return {
    href: link.url,
    type,
    profile,
    rel: link.rel,
    templated: link.templated,
    indirectionType: link.indirectionType
  };
};

export const resolveReaderActionFromFulfillmentLinks = (
  links: readonly FulfillmentLink[],
  options?: ReaderRouterOptions
): ReaderAction | null => {
  const acquisitionLinks = links.map(fulfillmentToAcquisitionLink);
  return resolveReaderAction(acquisitionLinks, options);
};
