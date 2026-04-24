import type { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "stream";

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Block requests to private/loopback/cloud-metadata IP ranges to prevent
 * Server-Side Request Forgery (SSRF) attacks. This proxy is intentionally
 * open to any public hostname (audiobook CDN hostnames are not known at
 * build time), so blocking internal ranges is the practical mitigation.
 */
const SSRF_BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/, // IPv4 loopback
  /^0\.0\.0\.0$/,
  /^::1$/, // IPv6 loopback
  /^10\.\d+\.\d+\.\d+$/, // RFC-1918 class A
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // RFC-1918 class B
  /^192\.168\.\d+\.\d+$/, // RFC-1918 class C
  /^169\.254\.\d+\.\d+$/, // link-local / AWS+GCP+Azure metadata (169.254.169.254)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/, // CGNAT (RFC-6598)
  /^fc00:/i, // IPv6 ULA
  /^fd[0-9a-f]{2}:/i, // IPv6 ULA
  /\.local$/i, // mDNS / local network
  /\.internal$/i, // cloud-internal DNS
];

const isSsrfTarget = (hostname: string): boolean =>
  SSRF_BLOCKED_HOSTNAME_PATTERNS.some(pattern => pattern.test(hostname));

const copyHeader = (source: Headers, target: NextApiResponse, name: string) => {
  const value = source.get(name);
  if (value) target.setHeader(name, value);
};

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges, Content-Type, Content-Disposition"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Range, X-Reader-Authorization"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "POST") {
    res.status(405).end("Method Not Allowed");
    return;
  }

  const urlParam = Array.isArray(req.query.url)
    ? req.query.url[0]
    : req.query.url;

  if (!urlParam || typeof urlParam !== "string" || !isHttpUrl(urlParam)) {
    res.status(400).end("Missing or invalid url parameter.");
    return;
  }

  // Reject requests targeting private/loopback/cloud-metadata ranges (SSRF).
  try {
    const { hostname } = new URL(urlParam);
    if (isSsrfTarget(hostname)) {
      res.status(400).end("URL target is not allowed.");
      return;
    }
  } catch {
    res.status(400).end("Missing or invalid url parameter.");
    return;
  }

  const headers = new Headers();
  const readerAuth =
    typeof req.headers["x-reader-authorization"] === "string"
      ? req.headers["x-reader-authorization"]
      : Array.isArray(req.headers["x-reader-authorization"])
        ? req.headers["x-reader-authorization"][0]
        : undefined;
  if (readerAuth) {
    headers.set("authorization", readerAuth);
  }
  if (req.headers.range) {
    headers.set("range", req.headers.range);
  }
  if (req.headers.accept) {
    headers.set("accept", req.headers.accept);
  }
  if (req.headers["content-type"]) {
    headers.set(
      "content-type",
      Array.isArray(req.headers["content-type"])
        ? req.headers["content-type"][0]
        : req.headers["content-type"]
    );
  }

  let body: Buffer | undefined;
  if (req.method === "POST") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    body = Buffer.concat(chunks);
  }

  try {
    const requestBody = body as unknown as BodyInit | undefined;
    const upstream = await fetch(urlParam, {
      method: req.method,
      headers,
      redirect: "follow",
      body: requestBody
    });

    res.statusCode = upstream.status;
    copyHeader(upstream.headers, res, "content-type");
    copyHeader(upstream.headers, res, "content-length");
    copyHeader(upstream.headers, res, "content-range");
    copyHeader(upstream.headers, res, "accept-ranges");
    copyHeader(upstream.headers, res, "cache-control");
    copyHeader(upstream.headers, res, "content-disposition");
    copyHeader(upstream.headers, res, "etag");

    if (!upstream.ok) {
      const errorText = await upstream.text();
      console.error("[api/fulfill] upstream non-OK", {
        method: req.method,
        url: urlParam,
        status: upstream.status,
        hasAuth: Boolean(readerAuth),
        accept: req.headers.accept,
        bodySnippet: errorText.slice(0, 300)
      });
      res.end(errorText);
      return;
    }

    if (req.method === "HEAD" || !upstream.body) {
      res.end();
      return;
    }

    const bodyStream = Readable.fromWeb(upstream.body as any);
    bodyStream.on("error", streamError => {
      console.error("[api/fulfill] stream error", {
        method: req.method,
        url: urlParam,
        hasAuth: Boolean(readerAuth),
        accept: req.headers.accept,
        message:
          streamError instanceof Error
            ? streamError.message
            : "Unknown stream error"
      });
      if (!res.headersSent) {
        res.status(502).end("Failed to stream upstream response.");
      } else {
        res.end();
      }
    });
    bodyStream.pipe(res);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch upstream resource.";
    console.error("[api/fulfill] upstream fetch error", {
      method: req.method,
      url: urlParam,
      hasAuth: Boolean(readerAuth),
      accept: req.headers.accept,
      message
    });
    res.status(502).end(message);
  }
}
