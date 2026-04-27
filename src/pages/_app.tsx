import * as React from "react";
import { AppProps, NextWebVitalsMetric } from "next/app";
import { ErrorBoundary } from "components/ErrorBoundary";
import "css-overrides.css";
import track from "analytics/track";
import { BreadcrumbProvider } from "components/context/BreadcrumbContext";
import AppConfigContext from "components/context/AppConfigContext";
import { initBugsnag } from "analytics/bugsnag";
import { setMediaSupportConfig } from "utils/fulfill";
import { setFetchMediaSupportConfig } from "dataflow/opds1/fetch";
import { GTMScript, GTMNoscript } from "analytics/GoogleTagManager";
import type { AppConfig } from "interfaces";
import FALLBACK_APP_CONFIG from "config/fallbackAppConfig";

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
  const appConfig =
    (pageProps.appConfig as AppConfig | undefined) ?? FALLBACK_APP_CONFIG;

  // These calls are intentionally in the render body, not in useEffect. Two reasons:
  //
  // 1. initBugsnag must run before ErrorBoundary renders (synchronously below), because
  //    ErrorBoundary calls getBugsnagErrorBoundary() inline. A useEffect would run after
  //    the first commit, so the Bugsnag boundary would never be set for the initial render,
  //    silently dropping error coverage on first load.
  //
  // 2. setMediaSupportConfig must run during SSR: useEffect is skipped on the server, so
  //    moving it there would leave _mediaSupport as {} for every SSR pass, causing all books
  //    to appear unsupported on first load.
  //
  // Both functions are idempotent, so repeated calls from concurrent-mode retries are safe.
  initBugsnag(appConfig);
  setMediaSupportConfig(appConfig.mediaSupport);
  setFetchMediaSupportConfig(appConfig.mediaSupport);

  return (
    <AppConfigContext.Provider value={appConfig}>
      <GTMScript gtmId={appConfig.gtmId} />
      {/* Note: GTM recommends placing this immediately after <body>, but _document.tsx
          has no access to runtime config. It still appears in SSR HTML and functions correctly. */}
      <GTMNoscript gtmId={appConfig.gtmId} />
      <ErrorBoundary>
        <BreadcrumbProvider>
          <Component {...pageProps} />
        </BreadcrumbProvider>
      </ErrorBoundary>
    </AppConfigContext.Provider>
  );
};

export function reportWebVitals(metric: NextWebVitalsMetric) {
  track.webVitals(metric);
}

export default MyApp;
