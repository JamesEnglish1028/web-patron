import * as React from "react";
import { useRouter } from "next/router";
import { NextPage, GetStaticProps, GetStaticPaths } from "next";
import ReaderPageLayout from "components/reader/ReaderPageLayout";
import ReaderEngineView from "components/reader/ReaderEngineView";
import withAppProps, { AppProps } from "dataflow/withAppProps";
import { getReaderAuth } from "utils/readerAuth";

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
  const auth = authKey ? getReaderAuth(authKey) : null;
  const resolvedUrl = auth?.url || decodedHref;

  return (
    <ReaderPageLayout library={library} error={error}>
      {({ setLoading }) => (
        <ReaderEngineView
          resolvedUrl={resolvedUrl}
          contentType={contentType}
          authToken={auth?.token}
          title={titleParam ? decodeURIComponent(titleParam) : undefined}
          setLoading={setLoading}
        />
      )}
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
