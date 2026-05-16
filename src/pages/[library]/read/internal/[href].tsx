import * as React from "react";
import { useRouter } from "next/router";
import { NextPage, GetStaticProps, GetStaticPaths } from "next";
import ReaderPageLayout from "components/reader/ReaderPageLayout";
import ReaderEngineView from "components/reader/ReaderEngineView";
import withAppProps, { AppProps } from "dataflow/withAppProps";
import { getReaderAuth, type ReaderAuthPayload } from "utils/readerAuth";

const InternalReaderPage: NextPage<AppProps> = ({ library, error }) => {
  const router = useRouter();
  const hrefParam =
    typeof router.query.href === "string" ? router.query.href : "";
  const contentType =
    typeof router.query.ct === "string" ? router.query.ct : "";
  const authKey =
    typeof router.query.authKey === "string" ? router.query.authKey : "";
  const titleParam =
    typeof router.query.title === "string" ? router.query.title : "";
  const bookUrlParam =
    typeof router.query.bookUrl === "string" ? router.query.bookUrl : "";
  const coverUrlParam =
    typeof router.query.coverUrl === "string" ? router.query.coverUrl : "";
  const bookAuthorsParam =
    typeof router.query.bookAuthors === "string"
      ? router.query.bookAuthors
      : "";
  const bookPublisherParam =
    typeof router.query.bookPublisher === "string"
      ? router.query.bookPublisher
      : "";
  const bookLanguageParam =
    typeof router.query.bookLanguage === "string"
      ? router.query.bookLanguage
      : "";
  const bookIdentifierParam =
    typeof router.query.bookIdentifier === "string"
      ? router.query.bookIdentifier
      : "";

  const decodedHref = hrefParam ? decodeURIComponent(hrefParam) : "";

  // Read auth from storage only once the router is ready (client-side only).
  // Calling getReaderAuth during SSR or hydration would access sessionStorage/
  // localStorage which don't exist in Node, causing a hydration mismatch.
  const [auth, setAuth] = React.useState<ReaderAuthPayload | null>(null);
  React.useEffect(() => {
    if (!router.isReady) return;
    setAuth(authKey ? getReaderAuth(authKey) : null);
  }, [router.isReady, authKey]);

  const resolvedUrl = auth?.url || decodedHref;

  return (
    <ReaderPageLayout library={library} error={error}>
      {({ setLoading }) =>
        resolvedUrl ? (
          <ReaderEngineView
            resolvedUrl={resolvedUrl}
            contentType={contentType}
            authToken={auth?.token}
            title={titleParam ? decodeURIComponent(titleParam) : undefined}
            bookUrl={
              bookUrlParam ? decodeURIComponent(bookUrlParam) : undefined
            }
            coverUrl={
              coverUrlParam ? decodeURIComponent(coverUrlParam) : undefined
            }
            bookAuthors={
              bookAuthorsParam
                ? decodeURIComponent(bookAuthorsParam)
                : undefined
            }
            bookPublisher={
              bookPublisherParam
                ? decodeURIComponent(bookPublisherParam)
                : undefined
            }
            bookLanguage={
              bookLanguageParam
                ? decodeURIComponent(bookLanguageParam)
                : undefined
            }
            bookIdentifier={
              bookIdentifierParam
                ? decodeURIComponent(bookIdentifierParam)
                : undefined
            }
            setLoading={setLoading}
          />
        ) : null
      }
    </ReaderPageLayout>
  );
};

export const getStaticProps: GetStaticProps = withAppProps();

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: [],
    fallback: true
  };
};

export default InternalReaderPage;
