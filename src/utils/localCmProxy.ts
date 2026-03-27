const LOCAL_CM_HOSTS = new Set([
  "localhost:6500",
  "127.0.0.1:6500",
  "[::1]:6500"
]);

export function toBrowserFetchUrl(url: string): string {
  if (typeof window === "undefined") return url;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" || !LOCAL_CM_HOSTS.has(parsed.host)) {
      return url;
    }

    const cacheBust = Date.now().toString();
    return `/api/cm?url=${encodeURIComponent(parsed.toString())}&_=${cacheBust}`;
  } catch {
    return url;
  }
}
