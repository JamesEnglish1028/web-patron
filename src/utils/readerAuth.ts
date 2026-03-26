export type ReaderAuthPayload = {
  url: string;
  token?: string;
};

const AUTH_PREFIX = "reader-auth:";

const generateKey = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `auth-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const storeReaderAuth = (payload: ReaderAuthPayload): string => {
  const key = generateKey();
  try {
    sessionStorage.setItem(`${AUTH_PREFIX}${key}`, JSON.stringify(payload));
  } catch {
    // ignore storage errors; caller can proceed without stored auth
  }
  return key;
};

export const getReaderAuth = (key: string): ReaderAuthPayload | null => {
  try {
    const raw = sessionStorage.getItem(`${AUTH_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as ReaderAuthPayload;
  } catch {
    return null;
  }
};
