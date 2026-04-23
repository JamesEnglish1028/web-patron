import * as React from "react";
import { Box, type ThemeUIStyleObject } from "theme-ui";
import { Text, H2 } from "components/Text";
import ReaderControls from "../ReaderControls";
import ReaderUtilityControls from "../ReaderUtilityControls";
import { useReaderInfo } from "../ReaderWrapper";
import {
  parseAudiobookManifest,
  type ParsedAudiobookManifest
} from "utils/audiobookManifest";
import Button from "components/Button";
import { getProxiedUrl } from "utils/proxyUrl";
import { toBrowserFetchUrl } from "utils/localCmProxy";
import { isPalaceManagerLikeUrl } from "utils/fulfill";

type AudioBookmark = {
  id: string;
  trackIndex: number;
  time: number;
  trackTitle: string;
  createdAt: number;
};

type AudioElementProps = {
  as: "audio";
  sx?: ThemeUIStyleObject;
  ref?: React.Ref<HTMLAudioElement>;
} & React.AudioHTMLAttributes<HTMLAudioElement>;

const AudioElement = Box as unknown as React.FC<AudioElementProps>;

const createId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const cleanPath = (value?: string | null): string => {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    return parsed.pathname;
  } catch {
    return value.split("#")[0].split("?")[0];
  }
};

const isFulfillUrl = (value?: string | null): boolean => {
  if (!value) return false;
  try {
    return new URL(value).pathname.includes("/fulfill/");
  } catch {
    return value.includes("/fulfill/");
  }
};

const isLocalCmUrl = (value?: string | null): boolean => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "http:" &&
      ["localhost:6500", "127.0.0.1:6500", "[::1]:6500"].includes(parsed.host)
    );
  } catch {
    return false;
  }
};

const buildReaderRequest = (
  targetUrl: string,
  authToken?: string,
  accept?: string
): { url: string; headers: Record<string, string> | undefined } => {
  const headers: Record<string, string> = {};
  const localCm = isLocalCmUrl(targetUrl);

  if (authToken) {
    if (localCm) {
      headers.Authorization = authToken;
    } else {
      headers["X-Reader-Authorization"] = authToken;
    }
  }

  if (accept) {
    headers.accept = accept;
  }

  return {
    url: localCm ? toBrowserFetchUrl(targetUrl) : getProxiedUrl(targetUrl),
    headers: Object.keys(headers).length ? headers : undefined
  };
};

const sleep = (ms: number) =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const isCannotFulfillLoanError = (status: number, detail: string) =>
  status === 500 && detail.toLowerCase().includes("cannot-fulfill-loan");

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

type AudioReaderProps = {
  url: string;
  authToken?: string;
  contentType?: string;
  title?: string;
  setLoading: (value: boolean) => void;
};

const AudioReader: React.FC<AudioReaderProps> = ({
  url,
  authToken,
  contentType,
  setLoading
}) => {
  const [error, setError] = React.useState<string | null>(null);
  const [manifest, setManifest] =
    React.useState<ParsedAudiobookManifest | null>(null);
  const [trackIndex, setTrackIndex] = React.useState(0);
  const [trackUrl, setTrackUrl] = React.useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = React.useState(1);
  const [showToc, setShowToc] = React.useState(false);
  const [tocTab, setTocTab] = React.useState<"toc" | "bookmarks">("toc");
  const [bookmarks, setBookmarks] = React.useState<AudioBookmark[]>([]);
  const [resumeLabel, setResumeLabel] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const readerInfo = useReaderInfo();
  const resumeTimeRef = React.useRef<number | null>(null);

  const storageKey = React.useMemo(() => `reader:audio:position:${url}`, [url]);
  const bookmarksKey = React.useMemo(
    () => `reader:audio:bookmarks:${url}`,
    [url]
  );
  const leftControls = readerInfo?.backControl;

  const resolveTrackIndex = React.useCallback(
    (href: string) => {
      const target = cleanPath(href);
      if (!target) return -1;
      return (
        manifest?.tracks.findIndex(track => {
          const source = cleanPath(track.href);
          return (
            source === target ||
            source.endsWith(target) ||
            target.endsWith(source)
          );
        }) ?? -1
      );
    },
    [manifest]
  );

  const persistPlaybackPosition = React.useCallback(
    (nextTrackIndex: number, nextTime: number) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            trackIndex: nextTrackIndex,
            time: Number.isFinite(nextTime) ? Math.max(0, nextTime) : 0,
            updatedAt: Date.now()
          })
        );
      } catch {
        // ignore storage errors
      }
    },
    [storageKey]
  );

  React.useEffect(() => {
    let active = true;
    const objectUrl: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      setTrackUrl(null);
      setTrackIndex(0);
      resumeTimeRef.current = null;
      setResumeLabel(null);
      try {
        const initialRequest = buildReaderRequest(
          url,
          authToken,
          isFulfillUrl(url)
            ? "application/vnd.librarysimplified.bearer-token+json, application/audiobook+json;q=0.9, */*;q=0.1"
            : contentType || undefined
        );
        let response = await fetch(initialRequest.url, {
          headers: initialRequest.headers
        });
        if (!response.ok) {
          let detail = await response.text().catch(() => "");

          // Palace/local-CM can briefly return cannot-fulfill-loan immediately
          // after borrow while provider state is still syncing.
          if (
            (isLocalCmUrl(url) || isPalaceManagerLikeUrl(url)) &&
            isFulfillUrl(url) &&
            isCannotFulfillLoanError(response.status, detail)
          ) {
            for (const waitMs of [400, 900, 1500, 2400]) {
              await sleep(waitMs);
              response = await fetch(initialRequest.url, {
                headers: initialRequest.headers
              });
              if (response.ok) break;
              detail = await response.text().catch(() => "");
              if (!isCannotFulfillLoanError(response.status, detail)) break;
            }

            // Some providers require POST for fulfill, even when GET keeps
            // returning cannot-fulfill-loan while syncing.
            if (
              !response.ok &&
              isCannotFulfillLoanError(response.status, detail)
            ) {
              const getResponseBeforePost = response;
              const getDetailBeforePost = detail;
              let postUnsupported = false;

              for (const waitMs of [0, 700, 1500]) {
                if (waitMs > 0) await sleep(waitMs);
                const postAttempt = await fetch(initialRequest.url, {
                  method: "POST",
                  headers: initialRequest.headers
                });
                if (postAttempt.ok) {
                  response = postAttempt;
                  break;
                }
                detail = await postAttempt.text().catch(() => "");
                response = postAttempt;
                if (postAttempt.status === 405) {
                  // Provider does not allow POST fulfill; continue with GET flow.
                  postUnsupported = true;
                  break;
                }
                if (!isCannotFulfillLoanError(postAttempt.status, detail)) {
                  break;
                }
              }

              if (postUnsupported) {
                response = getResponseBeforePost;
                detail = getDetailBeforePost;
                for (const waitMs of [1100, 2200]) {
                  await sleep(waitMs);
                  const getRetry = await fetch(initialRequest.url, {
                    headers: initialRequest.headers
                  });
                  if (getRetry.ok) {
                    response = getRetry;
                    break;
                  }
                  detail = await getRetry.text().catch(() => "");
                  response = getRetry;
                  if (!isCannotFulfillLoanError(getRetry.status, detail)) {
                    break;
                  }
                }
              }
            }

            // Local Palace development environments can take longer to promote
            // a just-borrowed loan into a fulfillable audiobook manifest.
            if (
              !response.ok &&
              isCannotFulfillLoanError(response.status, detail)
            ) {
              for (const waitMs of [1800, 2500, 3200, 4200, 5200]) {
                await sleep(waitMs);
                const getRetry = await fetch(initialRequest.url, {
                  headers: initialRequest.headers
                });
                if (getRetry.ok) {
                  response = getRetry;
                  break;
                }
                detail = await getRetry.text().catch(() => "");
                response = getRetry;
                if (!isCannotFulfillLoanError(getRetry.status, detail)) {
                  break;
                }
              }
            }
          }

          if (response.ok) {
            // Continue below with successful retried response.
          } else {
            const suffix = isCannotFulfillLoanError(response.status, detail)
              ? " (Palace Manager reports loan cannot be fulfilled yet)"
              : "";
            throw new Error(
              `Failed to load manifest (${response.status})${
                detail ? `: ${detail.slice(0, 240)}` : ""
              }${suffix}`
            );
          }
        }

        // Check if response is a Library Simplified bearer-token document
        const responseContentType =
          response.headers.get("content-type")?.toLowerCase() || "";
        let manifestText: string;
        let manifestUrl = url;
        let bearerAccessToken: string | null = null;

        if (
          responseContentType.includes(
            "application/vnd.librarysimplified.bearer-token+json"
          )
        ) {
          // Two-step auth: extract token and location from bearer-token document
          const bearerTokenData = await response.json();
          bearerAccessToken =
            bearerTokenData.access_token || bearerTokenData.accessToken || null;
          const location = bearerTokenData.location;

          if (!bearerAccessToken || !location) {
            throw new Error(
              "Bearer-token document missing accessToken or location"
            );
          }

          // Cache the extracted token for the manifest URL itself
          try {
            sessionStorage.setItem(
              `reader:audio:token:${location}`,
              bearerAccessToken
            );
          } catch {
            // ignore storage errors
          }

          // Fetch manifest from the provided location with new bearer token
          manifestUrl = location;
          const manifestRequest = buildReaderRequest(
            manifestUrl,
            `Bearer ${bearerAccessToken}`,
            contentType || "application/audiobook+json"
          );
          response = await fetch(manifestRequest.url, {
            headers: manifestRequest.headers
          });

          if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new Error(
              `Failed to load manifest from location (${response.status})${
                detail ? `: ${detail.slice(0, 240)}` : ""
              }`
            );
          }

          manifestText = await response.text();
        } else {
          // Direct manifest response (no bearer-token indirection)
          manifestText = await response.text();
        }

        if (!active) return;
        const parsed = parseAudiobookManifest(manifestText, manifestUrl);
        setManifest(parsed);

        // Cache bearer token for every track so track fetches use correct auth
        if (bearerAccessToken) {
          try {
            for (const t of parsed.tracks) {
              sessionStorage.setItem(
                `reader:audio:token:${t.href}`,
                bearerAccessToken
              );
            }
          } catch {
            // ignore storage errors
          }
        }

        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const saved = JSON.parse(raw) as {
              trackIndex?: number;
              time?: number;
            };
            const savedTrackIndex = Number(saved.trackIndex);
            const savedTime = Number(saved.time);
            if (
              Number.isFinite(savedTrackIndex) &&
              savedTrackIndex >= 0 &&
              savedTrackIndex < parsed.tracks.length
            ) {
              setTrackIndex(savedTrackIndex);
              if (Number.isFinite(savedTime) && savedTime > 0) {
                resumeTimeRef.current = savedTime;
                const label =
                  parsed.tracks[savedTrackIndex]?.title ||
                  `Track ${savedTrackIndex + 1}`;
                setResumeLabel(`Resume: ${label} at ${formatTime(savedTime)}`);
              }
            }
          }
        } catch {
          // ignore storage parse errors
        }
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Failed to load audiobook."
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, authToken, contentType, setLoading, storageKey]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(bookmarksKey);
      if (raw) {
        const parsed = JSON.parse(raw) as AudioBookmark[];
        if (Array.isArray(parsed)) {
          setBookmarks(parsed);
          return;
        }
      }
      setBookmarks([]);
    } catch {
      setBookmarks([]);
    }
  }, [bookmarksKey]);

  React.useEffect(() => {
    try {
      localStorage.setItem(bookmarksKey, JSON.stringify(bookmarks));
    } catch {
      // ignore storage errors
    }
  }, [bookmarks, bookmarksKey]);

  // Re-fetches the fulfillment URL to obtain a fresh bearer token and
  // re-caches it for all tracks. Called on 401/403 during track load.
  const refreshBearerToken = React.useCallback(async (): Promise<
    string | null
  > => {
    try {
      const req = buildReaderRequest(url, authToken);
      const resp = await fetch(req.url, { headers: req.headers });
      if (!resp.ok) return null;
      const ct = resp.headers.get("content-type")?.toLowerCase() || "";
      if (!ct.includes("application/vnd.librarysimplified.bearer-token+json")) {
        return null;
      }
      const data = await resp.json();
      const freshToken: string = data.access_token || data.accessToken || "";
      const freshLocation: string = data.location || "";
      if (!freshToken || !freshLocation) return null;

      // Re-fetch the manifest to get the updated set of track URLs for caching
      const manifestReq = buildReaderRequest(
        freshLocation,
        `Bearer ${freshToken}`,
        contentType || "application/audiobook+json"
      );
      const manifestResp = await fetch(manifestReq.url, {
        headers: manifestReq.headers
      });
      if (!manifestResp.ok) return null;

      const manifestText = await manifestResp.text();
      const freshManifest = parseAudiobookManifest(manifestText, freshLocation);

      try {
        for (const t of freshManifest.tracks) {
          sessionStorage.setItem(`reader:audio:token:${t.href}`, freshToken);
        }
      } catch {
        // ignore storage errors
      }

      return freshToken;
    } catch {
      return null;
    }
  }, [url, authToken, contentType]);

  React.useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const loadTrack = async () => {
      if (!manifest?.tracks?.length) return;
      setLoading(true);
      setTrackUrl(null);
      const track = manifest.tracks[trackIndex];
      try {
        const headers: Record<string, string> = {};

        // Try to use cached bearer token for this specific track URL
        try {
          const cachedToken = sessionStorage.getItem(
            `reader:audio:token:${track.href}`
          );
          if (cachedToken) {
            headers["X-Reader-Authorization"] = `Bearer ${cachedToken}`;
          }
        } catch {
          // ignore storage errors
        }

        // Fallback to X-Reader-Authorization if no cached bearer token
        if (!headers["X-Reader-Authorization"] && authToken) {
          headers["X-Reader-Authorization"] = authToken;
        }

        const localCm = isLocalCmUrl(track.href);
        const trackHeaders: Record<string, string> = localCm ? {} : headers;

        if (localCm) {
          const trackAuthorization =
            headers["X-Reader-Authorization"] || headers.Authorization;
          if (trackAuthorization) {
            trackHeaders.Authorization = trackAuthorization;
          }
        }

        const response = await fetch(
          localCm ? toBrowserFetchUrl(track.href) : getProxiedUrl(track.href),
          {
            headers: Object.keys(trackHeaders).length ? trackHeaders : undefined
          }
        );
        if (!response.ok) {
          // On 401/403, attempt a bearer-token refresh and retry once.
          if (response.status === 401 || response.status === 403) {
            const freshToken = await refreshBearerToken();
            if (freshToken) {
              const retryHeaders: Record<string, string> = localCm
                ? { Authorization: `Bearer ${freshToken}` }
                : { "X-Reader-Authorization": `Bearer ${freshToken}` };
              const retryResponse = await fetch(
                localCm
                  ? toBrowserFetchUrl(track.href)
                  : getProxiedUrl(track.href),
                { headers: retryHeaders }
              );
              if (retryResponse.ok) {
                const blob = await retryResponse.blob();
                objectUrl = URL.createObjectURL(blob);
                if (!active) return;
                setTrackUrl(objectUrl);
                return;
              }
            }
          }
          const detail = await response.text().catch(() => "");
          throw new Error(
            `Failed to load audio track (${response.status})${
              detail ? `: ${detail.slice(0, 240)}` : ""
            }`
          );
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!active) return;
        setTrackUrl(objectUrl);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Failed to load audio track."
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    loadTrack();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [manifest, trackIndex, authToken, setLoading, refreshBearerToken]);

  React.useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, trackUrl]);

  const persistCurrentPosition = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    persistPlaybackPosition(trackIndex, audio.currentTime || 0);
  }, [persistPlaybackPosition, trackIndex]);

  const handleLoadedMetadata = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;

    if (resumeTimeRef.current !== null) {
      const nextTime = Math.max(0, resumeTimeRef.current);
      if (
        Number.isFinite(nextTime) &&
        Number.isFinite(audio.duration) &&
        nextTime < audio.duration
      ) {
        audio.currentTime = nextTime;
      }
      resumeTimeRef.current = null;
    }
  }, [playbackRate]);

  const goToTrack = React.useCallback(
    (next: number, time = 0) => {
      if (!manifest?.tracks?.length) return;
      const clamped = Math.max(0, Math.min(manifest.tracks.length - 1, next));
      const nextTime = Math.max(0, time);
      resumeTimeRef.current = nextTime;
      persistPlaybackPosition(clamped, nextTime);
      setTrackIndex(clamped);
      setResumeLabel(null);
    },
    [manifest, persistPlaybackPosition]
  );

  const handleTrackEnded = React.useCallback(() => {
    if (!manifest?.tracks?.length) return;
    if (trackIndex >= manifest.tracks.length - 1) return;
    goToTrack(trackIndex + 1);
  }, [goToTrack, manifest, trackIndex]);

  const addBookmark = React.useCallback(() => {
    const audio = audioRef.current;
    if (!manifest?.tracks?.length || !audio) return;
    const current = manifest.tracks[trackIndex];
    const next: AudioBookmark = {
      id: createId(),
      trackIndex,
      time: Math.max(0, audio.currentTime || 0),
      trackTitle: current?.title || `Track ${trackIndex + 1}`,
      createdAt: Date.now()
    };
    setBookmarks(prev => [next, ...prev]);
    setShowToc(true);
    setTocTab("bookmarks");
  }, [manifest, trackIndex]);

  const removeBookmark = React.useCallback((id: string) => {
    setBookmarks(prev => prev.filter(entry => entry.id !== id));
  }, []);

  const sortedBookmarks = React.useMemo(
    () =>
      bookmarks
        .slice()
        .sort((a, b) => a.trackIndex - b.trackIndex || a.time - b.time),
    [bookmarks]
  );

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Text sx={{ color: "ui.error" }}>{error}</Text>
      </Box>
    );
  }

  if (!manifest || !trackUrl) {
    return (
      <Box sx={{ p: 3 }}>
        <Text>Preparing audiobook...</Text>
      </Box>
    );
  }

  const currentTrack = manifest.tracks[trackIndex];

  return (
    <Box
      sx={{
        flex: 1,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <ReaderControls
        title={manifest.title}
        canPrev={false}
        canNext={false}
        canAdjust={false}
        leftControls={leftControls}
        extraControls={
          <ReaderUtilityControls
            onToggleToc={() => setShowToc(prev => !prev)}
            onAddBookmark={addBookmark}
            disableSearch
            disableTheme
            tocActive={showToc}
          />
        }
      />
      {showToc && (
        <Box sx={panelStyles.right as any}>
          <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
            <Button
              variant={tocTab === "toc" ? "filled" : "ghost"}
              color="text"
              onClick={() => setTocTab("toc")}
            >
              TOC
            </Button>
            <Button
              variant={tocTab === "bookmarks" ? "filled" : "ghost"}
              color="text"
              onClick={() => setTocTab("bookmarks")}
            >
              Bookmarks
            </Button>
          </Box>

          {tocTab === "toc" && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                maxHeight: "58vh",
                overflowY: "auto",
                pr: 1
              }}
            >
              {(manifest.toc.length > 0 ? manifest.toc : manifest.tracks).map(
                (item: any, index: number) => {
                  const resolved = resolveTrackIndex(
                    item.href || manifest.tracks[index]?.href || ""
                  );
                  const mappedIndex = resolved >= 0 ? resolved : index;
                  const isActive = mappedIndex === trackIndex;
                  return (
                    <Button
                      key={`${item.href || mappedIndex}-${index}`}
                      variant="ghost"
                      color="text"
                      onClick={() => goToTrack(mappedIndex)}
                      sx={{
                        justifyContent: "space-between",
                        textAlign: "left",
                        border: "1px solid",
                        borderColor: isActive
                          ? "brand.primary"
                          : "var(--reader-chrome-border, #e2e8f0)",
                        borderRadius: 8,
                        px: 2,
                        py: 2,
                        minHeight: "unset"
                      }}
                    >
                      {item.title ||
                        manifest.tracks[mappedIndex]?.title ||
                        `Track ${mappedIndex + 1}`}
                    </Button>
                  );
                }
              )}
            </Box>
          )}

          {tocTab === "bookmarks" && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {sortedBookmarks.length > 0 ? (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    maxHeight: "58vh",
                    overflowY: "auto",
                    pr: 1
                  }}
                >
                  {sortedBookmarks.map(bookmark => (
                    <Box
                      key={bookmark.id}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 2,
                        border: "1px solid",
                        borderColor: "var(--reader-chrome-border, #e2e8f0)",
                        borderRadius: 8,
                        p: 2
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Button
                          variant="ghost"
                          color="text"
                          onClick={() =>
                            goToTrack(bookmark.trackIndex, bookmark.time)
                          }
                          sx={{
                            justifyContent: "flex-start",
                            px: 0,
                            py: 0,
                            minHeight: "unset"
                          }}
                        >
                          {bookmark.trackTitle}
                        </Button>
                        <Text
                          variant="text.detail"
                          sx={{ color: "ui.gray.dark", mt: 1 }}
                        >
                          {formatTime(bookmark.time)}
                        </Text>
                      </Box>
                      <Button
                        variant="ghost"
                        color="text"
                        onClick={() => removeBookmark(bookmark.id)}
                      >
                        Remove
                      </Button>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Text variant="text.detail">No bookmarks yet.</Text>
              )}
            </Box>
          )}
        </Box>
      )}
      <Box sx={{ p: 3 }}>
        <H2>{manifest.title}</H2>
        <Text sx={{ mt: 2, color: "ui.gray.dark" }}>{manifest.author}</Text>
        {resumeLabel && (
          <Text variant="text.detail" sx={{ mt: 2, color: "ui.gray.dark" }}>
            {resumeLabel}
          </Text>
        )}
        <Box sx={{ mt: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Button
            variant="ghost"
            color="text"
            onClick={() => goToTrack(trackIndex - 1)}
            disabled={trackIndex === 0}
          >
            Previous Track
          </Button>
          <Button
            variant="ghost"
            color="text"
            onClick={() => goToTrack(trackIndex + 1)}
            disabled={trackIndex >= manifest.tracks.length - 1}
          >
            Next Track
          </Button>
          <Button
            variant="ghost"
            color="text"
            onClick={() => setPlaybackRate(1)}
          >
            1x
          </Button>
          <Button
            variant="ghost"
            color="text"
            onClick={() => setPlaybackRate(1.25)}
          >
            1.25x
          </Button>
          <Button
            variant="ghost"
            color="text"
            onClick={() => setPlaybackRate(1.5)}
          >
            1.5x
          </Button>
          <Button
            variant="ghost"
            color="text"
            onClick={() => setPlaybackRate(2)}
          >
            2x
          </Button>
        </Box>
        <Text sx={{ mt: 3 }}>
          Playing: {currentTrack.title || `Track ${trackIndex + 1}`}
        </Text>
        <AudioElement
          as="audio"
          controls
          src={trackUrl}
          ref={audioRef}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={persistCurrentPosition}
          onPause={persistCurrentPosition}
          onEnded={handleTrackEnded}
          sx={{ width: "100%", mt: 3 }}
        />
        {manifest.toc.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Text variant="text.headers.primary">Contents</Text>
            <Box sx={{ mt: 2, maxHeight: 200, overflowY: "auto" }}>
              {manifest.toc.map((item, index) => (
                <Button
                  key={`${item.href}-${index}`}
                  variant="ghost"
                  color="text"
                  onClick={() => {
                    const idx = resolveTrackIndex(item.href);
                    if (idx >= 0) goToTrack(idx);
                  }}
                  sx={{
                    justifyContent: "flex-start",
                    textAlign: "left",
                    border: "1px solid",
                    borderColor:
                      resolveTrackIndex(item.href) === trackIndex
                        ? "brand.primary"
                        : "var(--reader-chrome-border, #e2e8f0)",
                    borderRadius: 8,
                    mb: 1
                  }}
                >
                  {item.title}
                </Button>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

const panelStyles = {
  right: {
    position: "absolute",
    top: 64,
    right: 16,
    width: ["88vw", "380px"],
    maxWidth: "420px",
    maxHeight: "70vh",
    overflow: "hidden",
    border: "1px solid",
    borderColor: "var(--reader-chrome-border, #e2e8f0)",
    borderRadius: 10,
    background: "var(--reader-chrome-bg, #ffffff)",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
    zIndex: 6,
    p: 2
  }
};

export default AudioReader;
