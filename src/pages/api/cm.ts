import type { NextApiRequest, NextApiResponse } from "next";

const ALLOWED_HOSTS = new Set([
  "localhost:6500",
  "127.0.0.1:6500",
  "[::1]:6500"
]);

function getSingleQueryValue(
  value: string | string[] | undefined
): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] : value;
}

function buildForwardHeaders(req: NextApiRequest): Record<string, string> {
  const incoming = req.headers;
  const headers: Record<string, string> = {};

  const passthrough = [
    "authorization",
    "accept",
    "accept-language",
    "content-type",
    "if-match",
    "if-none-match",
    "x-requested-with"
  ];

  for (const key of passthrough) {
    const value = incoming[key];
    if (typeof value === "string" && value.length > 0) {
      headers[key] = value;
    }
  }

  return headers;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const rawUrl = getSingleQueryValue(req.query.url);
  if (!rawUrl) {
    res
      .status(400)
      .json({ title: "Bad Request", detail: "Missing query param: url" });
    return;
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    res
      .status(400)
      .json({ title: "Bad Request", detail: "Invalid target URL" });
    return;
  }

  if (target.protocol !== "http:" || !ALLOWED_HOSTS.has(target.host)) {
    res
      .status(403)
      .json({ title: "Forbidden", detail: "Target URL is not allowed" });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).json({
      title: "Method Not Allowed",
      detail: "Only GET and HEAD are supported"
    });
    return;
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: req.method,
      headers: buildForwardHeaders(req)
    });

    res.status(upstream.status);

    const contentType = upstream.headers.get("content-type");
    const cacheControl = upstream.headers.get("cache-control");
    const expires = upstream.headers.get("expires");

    if (contentType) res.setHeader("content-type", contentType);
    if (cacheControl) res.setHeader("cache-control", cacheControl);
    if (expires) res.setHeader("expires", expires);

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    res.send(body);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown proxy error";
    res.status(502).json({ title: "Bad Gateway", detail });
  }
}
