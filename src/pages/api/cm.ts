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

  if (
    req.method !== "GET" &&
    req.method !== "HEAD" &&
    req.method !== "POST" &&
    req.method !== "PUT"
  ) {
    res.status(405).json({
      title: "Method Not Allowed",
      detail: "Only GET, HEAD, POST, and PUT are supported"
    });
    return;
  }

  let requestBody: Uint8Array | undefined;
  if (req.method === "POST" || req.method === "PUT") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    requestBody = new Uint8Array(Buffer.concat(chunks));
  }

  const bodyInit = requestBody
    ? (requestBody as unknown as BodyInit)
    : undefined;

  try {
    const forwardHeaders = buildForwardHeaders(req);
    const upstream = await fetch(target.toString(), {
      method: req.method,
      headers: forwardHeaders,
      body: bodyInit
    });

    if (!upstream.ok) {
      const errorText = await upstream.text().catch(() => "");
      console.error("[api/cm] upstream non-OK", {
        method: req.method,
        url: target.toString(),
        status: upstream.status,
        hasAuth: typeof req.headers.authorization === "string",
        accept: req.headers.accept,
        bodySnippet: errorText.slice(0, 300)
      });

      const contentType = upstream.headers.get("content-type");
      const cacheControl = upstream.headers.get("cache-control");
      const expires = upstream.headers.get("expires");
      if (contentType) res.setHeader("content-type", contentType);
      if (cacheControl) res.setHeader("cache-control", cacheControl);
      if (expires) res.setHeader("expires", expires);

      res.status(upstream.status);
      res.send(Buffer.from(errorText));
      return;
    }

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
