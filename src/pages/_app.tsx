import * as React from "react";
import { AppProps, NextWebVitalsMetric } from "next/app";
import { ErrorBoundary } from "components/ErrorBoundary";
import "css-overrides.css";
import track from "analytics/track";
import { BreadcrumbProvider } from "components/context/BreadcrumbContext";

/**
 * We can mock our backend api with MSW (mock service worker).
 */
if (
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_API_MOCKING === "true"
) {
  console.warn("Using MSW to intercept network requests");
  require("../../msw");
}

const MyApp = (props: AppProps) => {
  const { Component, pageProps } = props;
  return (
    <ErrorBoundary>
      <BreadcrumbProvider>
        <Component {...pageProps} />
      </BreadcrumbProvider>
    </ErrorBoundary>
  );
};

export function reportWebVitals(metric: NextWebVitalsMetric) {
  track.webVitals(metric);
}

export default MyApp;
