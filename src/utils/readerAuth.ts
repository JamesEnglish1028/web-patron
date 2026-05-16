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
  const storageKey = `${AUTH_PREFIX}${key}`;
  const raw = JSON.stringify(payload);
  try {
    sessionStorage.setItem(storageKey, raw);
  } catch {
    // ignore storage errors; caller can proceed without stored auth
  }
  try {
    // localStorage provides a reload-safe fallback if sessionStorage is unavailable.
    localStorage.setItem(storageKey, raw);
  } catch {
    // ignore storage errors; caller can proceed without stored auth
  }
  return key;
};

export const getReaderAuth = (key: string): ReaderAuthPayload | null => {
  const storageKey = `${AUTH_PREFIX}${key}`;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) {
      const localRaw = localStorage.getItem(storageKey);
      if (!localRaw) return null;
      return JSON.parse(localRaw) as ReaderAuthPayload;
    }
    // Mirror back into localStorage for better resilience across reloads.
    try {
      localStorage.setItem(storageKey, raw);
    } catch {
      // ignore mirror failures
    }
    if (!raw) return null;
    return JSON.parse(raw) as ReaderAuthPayload;
  } catch {
    return null;
  }
};
