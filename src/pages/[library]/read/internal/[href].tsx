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
