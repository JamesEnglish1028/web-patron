import { fetchBearerToken, fetchBook } from "dataflow/opds1/fetch";
import ApplicationError from "errors";
import {
  AnyBook,
  FulfillableBook,
  FulfillmentLink,
  MediaSupportLevel,
  OPDS1
} from "interfaces";
import { DownloadMediaType, ReadOnlineMediaType } from "types/opds1";
import { bookIsAudiobook } from "utils/book";
import { APP_CONFIG } from "utils/env";
import { typeMap } from "utils/file";

/**
 * Fulfilling a book requires a couple pieces of information:
 *  - The configured support type for that combination of indirectionType and contentType
 *  - What UX should be presented to the user
 *  - How to actually go about fulfilling that UX
 *
 * Both of these are determined by a combination of the final content type
 * and any layers of indirection the media is wrapped in. This file is an
 * attempt to centralize the logic of dealing with different media types
 * and layers of indirection.
 *
 * This file is based on:
 * https://docs.google.com/document/d/1dli5mgTbVaURN_B2AtUmPhgpaFUVqOqrzsaoFvCXnkA/edit?pli=1#
 */

export type AuthorizedLocation = {
  url: string;
  token?: string;
};

export type DownloadFulfillment = {
  type: "download";
  id: string;
  contentType: DownloadMediaType;
  getLocation: GetLocationWithIndirection;
  buttonLabel: string;
};
export type ReadInternalFulfillment = {
  type: "read-online-internal";
  id: string;
  url: string;
  contentType?: string;
  buttonLabel: string;
  getLocation?: GetLocationWithIndirection;
};
export type ReadExternalFulfillment = {
  type: "read-online-external";
  id: string;
  contentType: ReadOnlineMediaType;
  getLocation: GetLocationWithIndirection;
  buttonLabel: string;
};
export type UnsupportedFulfillment = {
  type: "unsupported";
};

export type SupportedFulfillment =
  | DownloadFulfillment
  | ReadExternalFulfillment
  | ReadInternalFulfillment;

export type AnyFullfillment = SupportedFulfillment | UnsupportedFulfillment;

export const isPalaceManagerLikeUrl = (value: string) => {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith("palace.io") ||
      hostname.endsWith("palaceproject.io") ||
      hostname.endsWith("thepalaceproject.org")
    );
  } catch {
    return false;
  }
};

export const getFulfillmentFromLink =
  (book: AnyBook) =>
  (link: FulfillmentLink): AnyFullfillment => {
    const { contentType, indirectionType, supportLevel } = link;
    const action = bookIsAudiobook(book) ? "Listen" : "Read";

    // don't show fulfillment option if it is unsupported or only allows
    // a redirect to the companion app.
    if (supportLevel === "unsupported" || supportLevel === "redirect") {
      return { type: "unsupported" };
    }

    // TODO: I'm not sure that we need these special "unsupported" cases here,
    //  since we can set this in the configuration. For example, there might
    //  be cases in the future in which there is no support in this app, but
    //  support is present in the mobile apps. It might be better to restrict
    //  the possible types, depending on whether we directly support it in-app.
    // there is no support for books with "Libby" DRM
    // There is no support for books with AxisNow DRM.
    if (
      [OPDS1.OverdriveEbookMediaType, OPDS1.AxisNowWebpubMediaType].includes(
        contentType
      )
    ) {
      return { type: "unsupported" };
    }

    switch (String(contentType)) {
      case OPDS1.PdfMediaType:
      case OPDS1.EpubMediaType: {
        const normalizedIndirection = String(indirectionType || "");
        const isAdobeDrm =
          normalizedIndirection === OPDS1.AdobeDrmMediaType ||
          normalizedIndirection === OPDS1.IncorrectAdobeDrmMediaType;
        if (!isAdobeDrm) {
          return {
            id: link.url,
            type: "read-online-internal",
            url: link.url,
            contentType,
            buttonLabel: action,
            getLocation: constructGetLocation(
              indirectionType,
              contentType,
              link.url
            )
          };
        }
        const typeName = typeMap[contentType].name;
        return {
          id: link.url,
          getLocation: constructGetLocation(
            indirectionType,
            contentType,
            link.url
          ),
          type: "download",
          buttonLabel: `Download Adobe ${typeName}`,
          contentType: contentType as DownloadMediaType
        };
      }
      case OPDS1.AudiobookMediaType:
      case OPDS1.AccessRestrictionAudiobookMediaType:
      case OPDS1.LcpAudioBookMediaType: {
        return {
          id: link.url,
          type: "read-online-internal",
          url: link.url,
          contentType,
          buttonLabel: action,
          getLocation: constructGetLocation(
            indirectionType,
            contentType,
            link.url
          )
        };
      }
      case OPDS1.Mobi8Mediatype:
      case OPDS1.MobiPocketMediaType: {
        const typeName = typeMap[contentType].name;
        return {
          id: link.url,
          getLocation: constructGetLocation(
            indirectionType,
            contentType,
            link.url
          ),
          type: "download",
          buttonLabel: `Download ${typeName}`,
          contentType: contentType as DownloadMediaType
        };
      }

      case OPDS1.ExternalReaderMediaType:
      case OPDS1.ExternalReaderMediaTypeUnquoted:
        return {
          id: link.url,
          type: "read-online-external",
          getLocation: constructGetLocation(
            indirectionType,
            contentType,
            link.url
          ),
          contentType: contentType as ReadOnlineMediaType,
          buttonLabel: `${action} Online`
        };

      /**
       * TODO: internal reader should have capabilities that persist with the mobile apps for a seamless experience
       * i.e. saved bookmarks in web carry over to mobile app
       */
      // case {internal_type}:
      //   return {
      //     id: link.url,
      //     type: "read-online-internal",
      //     url: link.url,
      //     buttonLabel: action
      //   };
    }
    // TODO: track to bugsnag that we have found an unhandled media type
    return {
      type: "unsupported"
    };
  };

export function getFulfillmentsFromBook(
  book: FulfillableBook
): SupportedFulfillment[] {
  // if (bookIsAudiobook(book)) return [];
  const links = book.fulfillmentLinks;
  const dedupedLinks = dedupeLinks(links);
  const supported = dedupedLinks
    .map(getFulfillmentFromLink(book))
    .filter(isSupported);

  return supported;
}

function isSupported(
  fulfillment: AnyFullfillment
): fulfillment is SupportedFulfillment {
  return fulfillment.type !== "unsupported";
}

/**
 * Constructs a function to be used later to fetch the actual url and token to use to retrieve the
 * book, when a user clicks on the fulfillment button
 */
type GetLocationWithIndirection = (
  catalogUrl: string,
  token?: string
) => Promise<AuthorizedLocation>;
const constructGetLocation =
  (
    indirectionType: OPDS1.IndirectAcquisitionType | undefined,
    contentType: OPDS1.AnyBookMediaType,
    url: string
  ): GetLocationWithIndirection =>
  async (catalogUrl: string, token?: string) => {
    /**
     * If there is OPDS Entry Indirection, we fetch the actual link
     * from within an entry
     */
    if (indirectionType === OPDS1.OPDSEntryMediaType) {
      const book = (await fetchBook(url, catalogUrl, token)) as FulfillableBook;
      const resolvedUrl = book.fulfillmentLinks?.find(
        link => link.contentType === contentType
      )?.url;
      if (!resolvedUrl) {
        throw new ApplicationError({
          title: "OPDS Error",
          detail:
            "Indirect OPDS Entry did not contain the correct acquisition link."
        });
      }
      return {
        url: resolvedUrl,
        token
      };
    }

    if (indirectionType === OPDS1.BearerTokenMediaType) {
      const bearerToken = await fetchBearerToken(url, token, {
        Accept: OPDS1.BearerTokenMediaType
      });
      const tokenType = bearerToken.token_type || "Bearer";

      return {
        url: bearerToken.location,
        token: `${tokenType} ${bearerToken.access_token}`
      };
    }

    // Some audiobook feeds expose a direct fulfill URL but still require
    // bearer-token exchange to return { location, token }.
    if (
      [
        OPDS1.AudiobookMediaType,
        OPDS1.AccessRestrictionAudiobookMediaType,
        OPDS1.LcpAudioBookMediaType
      ].includes(contentType)
    ) {
      if (isPalaceManagerLikeUrl(url)) {
        return {
          url,
          token
        };
      }

      try {
        const bearerToken = await fetchBearerToken(url, token, {
          Accept: OPDS1.BearerTokenMediaType
        });
        if (bearerToken?.location && bearerToken?.access_token) {
          const tokenType = bearerToken.token_type || "Bearer";
          return {
            url: bearerToken.location,
            token: `${tokenType} ${bearerToken.access_token}`
          };
        }
      } catch {
        try {
          const audiobookEntry = (await fetchBook(
            url,
            catalogUrl,
            token
          )) as FulfillableBook;
          const audiobookLink = audiobookEntry.fulfillmentLinks?.find(link =>
            [
              OPDS1.AudiobookMediaType,
              OPDS1.AccessRestrictionAudiobookMediaType,
              OPDS1.LcpAudioBookMediaType
            ].includes(link.contentType)
          );

          if (audiobookLink) {
            if (audiobookLink.indirectionType === OPDS1.BearerTokenMediaType) {
              const bearerToken = await fetchBearerToken(
                audiobookLink.url,
                token,
                {
                  Accept: OPDS1.BearerTokenMediaType
                }
              );
              if (bearerToken?.location && bearerToken?.access_token) {
                const tokenType = bearerToken.token_type || "Bearer";
                return {
                  url: bearerToken.location,
                  token: `${tokenType} ${bearerToken.access_token}`
                };
              }
            }

            return {
              url: audiobookLink.url,
              token
            };
          }
        } catch {
          // fall back to direct URL flow
        }
      }
    }

    // otherwise there is no indirection, just return the url and token.
    return {
      url,
      token
    };
  };

export function dedupeLinks(links: readonly FulfillmentLink[]) {
  return links.reduce<FulfillmentLink[]>((uniqueArr, current) => {
    const isDup = uniqueArr.find(
      uniqueLink => uniqueLink.contentType === current.contentType
    );

    return isDup ? uniqueArr : [...uniqueArr, current];
  }, []);
}

export function getAppSupportLevel(
  contentType: OPDS1.AnyBookMediaType,
  indirectionType: OPDS1.IndirectAcquisitionType | undefined
): MediaSupportLevel {
  const { mediaSupport } = APP_CONFIG;
  const defaultSupportLevel: MediaSupportLevel =
    mediaSupport?.default ?? "unsupported";

  // if there is indirection, we search through the dictionary nested inside the
  // indirectionType
  if (indirectionType) {
    const supportLevel = mediaSupport[indirectionType]?.[contentType];
    return supportLevel ?? defaultSupportLevel;
  }

  return mediaSupport[contentType] ?? defaultSupportLevel;
}

/**
 * Check if any of the links is redirect or redirect-and-show support level
 */
export function shouldRedirectToCompanionApp(
  links: readonly FulfillmentLink[]
) {
  return links.reduce((prev, link) => {
    if (prev) return true;
    const supportLevel = link.supportLevel;
    if (supportLevel === "redirect" || supportLevel === "redirect-and-show") {
      return true;
    }
    return false;
  }, false);
}
