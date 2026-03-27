import { Readable } from "stream";
import handler from "../cm";
import type { NextApiRequest, NextApiResponse } from "next";

type MockResponse = NextApiResponse & {
  statusCode: number;
  body?: unknown;
  headers: Record<string, string>;
};

const createResponse = (): MockResponse => {
  const response = {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name: string, value: string) {
      response.headers[String(name).toLowerCase()] = String(value);
      return response;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
    send(payload: unknown) {
      response.body = payload;
      return response;
    },
    end(payload?: unknown) {
      response.body = payload;
      return response;
    }
  } as unknown as MockResponse;

  return response;
};

const createRequest = ({
  method,
  url,
  body,
  headers
}: {
  method: "GET" | "HEAD" | "POST" | "PUT";
  url: string;
  body?: string;
  headers?: Record<string, string>;
}) => {
  const chunks = body ? [Buffer.from(body)] : [];
  const stream = Readable.from(chunks) as unknown as NextApiRequest;
  (stream as any).method = method;
  (stream as any).query = { url };
  (stream as any).headers = headers || {};
  return stream;
};

describe("/api/cm", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: jest.fn().mockReturnValue(null)
      },
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0))
    } as unknown as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("forwards POST body bytes to upstream", async () => {
    const payload = JSON.stringify({ username: "alice", password: "secret" });
    const req = createRequest({
      method: "POST",
      url: "http://localhost:6500/lib1/patrons/me/token",
      body: payload,
      headers: {
        "content-type": "application/json"
      }
    });
    const res = createResponse();

    await handler(req, res);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");

    const body = init.body as Uint8Array | undefined;
    expect(body).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(body || new Uint8Array()).toString("utf-8")).toBe(
      payload
    );
  });
});
