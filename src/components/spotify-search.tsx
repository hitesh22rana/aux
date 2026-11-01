"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import type { RoomView, Track } from "@/lib/catalog";
export function SpotifySearch({
  room,
  onUpdate,
}: {
  room: RoomView;
  onUpdate: (room: RoomView) => void;
}) {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const requestIdsRef = useRef(new Map<string, string>());
  const inFlightRef = useRef(false);
  const endpoint = `/api/rooms/${room.code}/spotify`;
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `${endpoint}?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setTracks(data.tracks);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError((e as Error).message);
          setTracks([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 500);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, endpoint]);
  async function request(track: Track) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPending(track.id);
    const requestId =
      requestIdsRef.current.get(track.id) || crypto.randomUUID();
    requestIdsRef.current.set(track.id, requestId);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "request", uri: track.id, requestId }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status !== 503 && response.status !== 502)
          requestIdsRef.current.delete(track.id);
        throw new Error(data.error);
      }
      onUpdate(data);
      requestIdsRef.current.delete(track.id);
      toast.success("Added to the Aux queue");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(null);
      inFlightRef.current = false;
    }
  }
  const results = query.trim().length >= 2 ? tracks : [];
  const isHost = room.members.some((m) => m.id === room.me && m.host);
  return (
    <section className="discover-section live-discover">
      <div className="section-heading">
        <div>
          <h2>Find it on Spotify</h2>
          <p>Search a song and artist, or paste a Spotify track link.</p>
        </div>
        <span className="catalog-label">PLAYED BY THE HOST’S APP</span>
      </div>
      <div className="search-field">
        <Search size={18} />
        <input
          id="spotify-search"
          aria-label="Search Spotify songs"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setTracks([]);
            setLoading(false);
            setError("");
          }}
          placeholder="Song, artist, or Spotify track link"
          enterKeyHint="search"
        />
        {query && (
          <button
            className="icon-button"
            aria-label="Clear Spotify search"
            onClick={() => {
              setQuery("");
              setError("");
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
      <p className="live-search-hint">
        Only the host connects a Spotify account. Aux keeps the queue and
        selects each track for their player.
      </p>
      {loading && (
        <p className="search-status" role="status">
          Searching Spotify…
        </p>
      )}
      {error && (
        <p className="connection-error" role="alert">
          {error}
        </p>
      )}
      <div className="live-search-results">
        {results.map((track) => {
          const queued =
            room.queue.some(
              (q) => q.trackId === track.id && q.delivery !== "failed",
            ) || room.current === track.id;
          return (
            <article className="live-song-result" key={track.id}>
              <a
                href={track.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${track.title} on Spotify`}
              >
                <Image
                  src={
                    track.art.startsWith("https:")
                      ? track.art
                      : `/art/${track.art}.svg`
                  }
                  unoptimized
                  width={48}
                  height={48}
                  alt={`${track.album} cover`}
                />
              </a>
              <div>
                <h3>{track.title}</h3>
                <p>{track.artist}</p>
                <a href={track.url} target="_blank" rel="noreferrer">
                  Spotify
                  <ExternalLink size={9} />
                </a>
              </div>
              <button
                className="button secondary"
                disabled={
                  queued ||
                  pending !== null ||
                  room.ended ||
                  (!isHost && room.locked)
                }
                aria-label={
                  queued ? `${track.title} requested` : `Request ${track.title}`
                }
                onClick={() => request(track)}
              >
                {queued ? <Check size={16} /> : <Plus size={16} />}
                <span>
                  {queued
                    ? "Requested"
                    : pending === track.id
                      ? "Sending…"
                      : "Request"}
                </span>
              </button>
            </article>
          );
        })}
      </div>
      {!loading && !error && !results.length && (
        <div className="empty-state">
          <Search size={25} />
          <h3>
            {query.trim().length >= 2
              ? "No matching songs."
              : "Your next song is a search away."}
          </h3>
          <p>
            {query.trim().length >= 2
              ? "Try the title together with the artist."
              : "Spotify plays the music. Your group chooses what comes next."}
          </p>
        </div>
      )}
    </section>
  );
}
