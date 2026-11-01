/** Native-app control capabilities for this Next.js build, not embedded players. */
export const providers = [
  "Spotify",
  "Apple Music",
  "Amazon Music",
  "YouTube Music",
  "TIDAL",
  "Deezer",
  "JioSaavn",
  "SoundCloud",
] as const;
export type Provider = (typeof providers)[number];
export type ProviderDefinition = {
  id: string;
  name: Provider;
  control: "remote" | "handoff";
  description: string;
  source: string;
  searchUrl: (query: string) => string;
};
export const providerDefinitions: ProviderDefinition[] = [
  {
    id: "spotify",
    name: "Spotify",
    control: "remote",
    description:
      "Automatic playback through the host’s active Spotify player. Premium and account connection required.",
    source:
      "https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback",
    searchUrl: (q) =>
      `https://open.spotify.com/search/${encodeURIComponent(q)}`,
  },
  {
    id: "apple",
    name: "Apple Music",
    control: "handoff",
    description:
      "Host opens each song in Apple Music and confirms it started. Native automatic control requires an Apple-platform companion app.",
    source:
      "https://developer.apple.com/documentation/musickit/systemmusicplayer",
    searchUrl: (q) =>
      `https://music.apple.com/us/search?term=${encodeURIComponent(q)}`,
  },
  {
    id: "amazon",
    name: "Amazon Music",
    control: "handoff",
    description:
      "Host opens each song in Amazon Music. Automatic integration needs approved access to Amazon’s closed-beta APIs.",
    source: "https://developer.amazon.com/docs/music/API_web_overview.html",
    searchUrl: (q) =>
      `https://music.amazon.com/search/${encodeURIComponent(q)}`,
  },
  {
    id: "youtube",
    name: "YouTube Music",
    control: "handoff",
    description:
      "Host opens a track link in YouTube Music and confirms playback. This build does not remote-control its native app.",
    source: "https://developers.google.com/youtube/v3/getting-started",
    searchUrl: (q) =>
      `https://music.youtube.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "tidal",
    name: "TIDAL",
    control: "handoff",
    description:
      "Track-link requests and host-confirmed playback in TIDAL. Automatic native-app control is not connected.",
    source: "https://developer.tidal.com/",
    searchUrl: (q) =>
      `https://listen.tidal.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "deezer",
    name: "Deezer",
    control: "handoff",
    description:
      "Track-link requests and host-confirmed playback in Deezer. Automatic native-app control is not connected.",
    source: "https://developers.deezer.com/",
    searchUrl: (q) => `https://www.deezer.com/search/${encodeURIComponent(q)}`,
  },
  {
    id: "saavn",
    name: "JioSaavn",
    control: "handoff",
    description:
      "Track-link requests and host-confirmed playback in JioSaavn. Automatic native-app control is not connected.",
    source: "https://www.jiosaavn.com/",
    searchUrl: (q) =>
      `https://www.jiosaavn.com/search/song/${encodeURIComponent(q)}`,
  },
  {
    id: "soundcloud",
    name: "SoundCloud",
    control: "handoff",
    description:
      "Track-link requests and host-confirmed playback in SoundCloud. Automatic native-app control is not connected.",
    source: "https://developers.soundcloud.com/docs/api/guide",
    searchUrl: (q) =>
      `https://soundcloud.com/search/sounds?q=${encodeURIComponent(q)}`,
  },
];
export function providerDefinition(name: Provider) {
  return providerDefinitions.find((p) => p.name === name)!;
}
export type TrackLink = { provider: Provider; id: string; url: string };
/** Parse only known track URL shapes. Never resolve redirects or fetch user URLs. */
export function parseTrackLink(input: string): TrackLink | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== "https:" || u.username || u.password || u.port)
      return null;
    const host = u.hostname.toLowerCase();
    const path = u.pathname;
    let provider: Provider | undefined;
    let id: string | undefined;
    let url = "";
    if (host === "open.spotify.com") {
      id = path.match(/^\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]{22})\/?$/)?.[1];
      provider = "Spotify";
      url = `https://open.spotify.com/track/${id}`;
    } else if (host === "music.apple.com") {
      const region = path.match(/^\/([a-z]{2})\//)?.[1] || "us";
      const song = path.match(/^\/[a-z]{2}\/song\/(?:[^/]+\/)?(\d+)\/?$/)?.[1];
      const album = path.match(
        /^\/[a-z]{2}\/album\/(?:[^/]+\/)?(\d+)\/?$/,
      )?.[1];
      id =
        song ||
        (album && /^\d+$/.test(u.searchParams.get("i") || "")
          ? u.searchParams.get("i")!
          : undefined);
      provider = "Apple Music";
      url = song
        ? `https://music.apple.com/${region}/song/${id}`
        : `https://music.apple.com/${region}/album/${album}?i=${id}`;
    } else if (
      /^music\.amazon\.(?:com|co\.uk|de|fr|it|es|in|co\.jp|com\.au|ca|com\.br|com\.mx)$/.test(
        host,
      )
    ) {
      id = path.match(/^\/(?:player\/)?tracks\/([A-Z0-9]{10})\/?$/i)?.[1];
      if (
        !id &&
        /^\/(?:player\/)?albums\/[A-Z0-9]{10}\/?$/i.test(path) &&
        /^[A-Z0-9]{10}$/i.test(u.searchParams.get("trackAsin") || "")
      )
        id = u.searchParams.get("trackAsin")!;
      provider = "Amazon Music";
      id = id?.toUpperCase();
      url = `https://${host}/tracks/${id}`;
    } else if (
      ["music.youtube.com", "www.youtube.com", "youtube.com"].includes(host) &&
      path === "/watch"
    ) {
      const video = u.searchParams.get("v");
      id = video && /^[A-Za-z0-9_-]{11}$/.test(video) ? video : undefined;
      provider = "YouTube Music";
      url = `https://music.youtube.com/watch?v=${id}`;
    } else if (host === "youtu.be") {
      id = path.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
      provider = "YouTube Music";
      url = `https://music.youtube.com/watch?v=${id}`;
    } else if (
      ["tidal.com", "www.tidal.com", "listen.tidal.com"].includes(host)
    ) {
      id = path.match(/^\/(?:browse\/)?track\/(\d+)\/?$/)?.[1];
      provider = "TIDAL";
      url = `https://tidal.com/browse/track/${id}`;
    } else if (["deezer.com", "www.deezer.com"].includes(host)) {
      id = path.match(/^\/(?:[a-z]{2}\/)?track\/(\d+)\/?$/)?.[1];
      provider = "Deezer";
      url = `https://www.deezer.com/track/${id}`;
    } else if (
      [
        "jiosaavn.com",
        "www.jiosaavn.com",
        "saavn.com",
        "www.saavn.com",
      ].includes(host)
    ) {
      const match = path.match(
        /^\/song\/([A-Za-z0-9%._~-]+)\/([A-Za-z0-9_,%-]+)\/?$/,
      );
      if (match) {
        id = match[2];
        url = `https://www.jiosaavn.com/song/${match[1]}/${id}`;
      }
      provider = "JioSaavn";
    } else if (
      ["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"].includes(
        host,
      )
    ) {
      const match = path.match(/^\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?$/);
      if (
        match &&
        !["search", "discover", "you", "settings", "stream", "charts"].includes(
          match[1],
        ) &&
        !["sets", "tracks", "albums", "popular-tracks", "reposts"].includes(
          match[2],
        )
      ) {
        id = `${match[1]}/${match[2]}`;
        url = `https://soundcloud.com/${id}`;
      }
      provider = "SoundCloud";
    }
    if (!provider || !id) return null;
    return {
      provider,
      id: `${providerDefinition(provider).id}:track:${id}`,
      url,
    };
  } catch {
    return null;
  }
}
