export const getProxiedUrl = (url: string) => {
  if (typeof window === "undefined") return url;
  try {
    const target = new URL(url, window.location.origin);
    if (target.origin === window.location.origin) return target.toString();
    return `/api/fulfill?url=${encodeURIComponent(target.toString())}`;
  } catch {
    return url;
  }
};
