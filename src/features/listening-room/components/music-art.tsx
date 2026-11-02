import Image from "next/image";
import { Music2, Play } from "lucide-react";
import type { Provider, Track } from "@/features/listening-room/model/catalog";
import { providerDefinition } from "@/features/listening-room/model/providers";
export function Art({
  track,
  size = 48,
  className = "",
  priority = false,
}: {
  track: Track;
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={
        track.art.startsWith("https://i.scdn.co/")
          ? track.art
          : `/art/${track.art}.svg`
      }
      width={size}
      height={size}
      alt={
        track.art === "placeholder"
          ? "Shared song artwork placeholder"
          : track.url
            ? `${track.album} cover`
            : `${track.album} - illustrated demo artwork`
      }
      className={`album-art ${className}`}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      unoptimized
    />
  );
}
function SpotifyGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 8c5-2 10-1.5 14 .8M6 12c4-1.5 8-1 12 1M7 16c3-1 6-.7 9 1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ProviderGlyph({
  provider,
  small,
}: {
  provider: Provider;
  small: boolean;
}) {
  if (provider === "Spotify") return <SpotifyGlyph />;
  if (provider === "YouTube Music")
    return <Play size={small ? 9 : 13} fill="currentColor" />;
  return <Music2 size={small ? 11 : 15} />;
}
export function ProviderMark({
  provider,
  small = false,
}: {
  provider: Provider;
  small?: boolean;
}) {
  return (
    <span
      className={`provider-mark ${small ? "small" : ""} provider-${providerDefinition(provider).id}`}
      aria-label={provider}
    >
      <ProviderGlyph provider={provider} small={small} />
    </span>
  );
}
