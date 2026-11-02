"use client";
import { useRef, useState } from "react";
import { ExternalLink, Link2, Search } from "lucide-react";
import { toast } from "sonner";
import { requestJson, errorMessage } from "@/shared/api/http-client";
import { roomViewSchema } from "@/features/listening-room/model/contracts";
import type { RoomView } from "@/features/listening-room/model/catalog";
import {
  parseTrackLink,
  providerDefinition,
} from "@/features/listening-room/model/providers";
export function LinkedTrackRequest({
  room,
  onUpdate,
}: {
  room: RoomView;
  onUpdate: (room: RoomView) => void;
}) {
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<{ fingerprint: string; id: string } | null>(null);
  const definition = providerDefinition(room.provider);
  const host = room.members.some((m) => m.id === room.me && m.host);
  const locked = room.ended || (!host && room.locked);
  const parsed = url ? parseTrackLink(url) : null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify([
      url.trim(),
      title.trim(),
      artist.trim(),
    ]);
    const request =
      requestRef.current?.fingerprint === fingerprint
        ? requestRef.current
        : { fingerprint, id: crypto.randomUUID() };
    requestRef.current = request;
    try {
      const data = await requestJson(
        `/api/rooms/${room.code}/handoff`,
        roomViewSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "request",
            url,
            title,
            artist,
            requestId: request.id,
          }),
        },
      );
      onUpdate(data);
      setUrl("");
      setTitle("");
      setArtist("");
      requestRef.current = null;
      toast.success(`Added to the ${room.provider} shared queue`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="discover-section linked-request">
      <div className="section-heading">
        <div>
          <h2>Bring a song from {room.provider}</h2>
          <p>
            Find a song in the music app, then share its full track link here.
          </p>
        </div>
      </div>
      <div className="provider-search-handoff">
        <div className="search-field">
          <Search size={17} />
          <input
            id="provider-track-search"
            aria-label={`Search on ${room.provider}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a song or artist in the music app"
          />
        </div>
        <a
          className="button secondary"
          href={definition.searchUrl(query)}
          target="_blank"
          rel="noreferrer"
        >
          Search {room.provider}
          <ExternalLink size={13} />
        </a>
      </div>
      <form onSubmit={submit} className="form-stack linked-request-form">
        <label>
          Song link
          <input
            id="linked-song-url"
            type="url"
            required
            maxLength={2048}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={`Paste a full ${room.provider} song URL`}
            autoComplete="off"
          />
        </label>
        {url && parsed && parsed.provider !== room.provider && (
          <p className="connection-error">
            This link is from {parsed.provider}. This room uses {room.provider}.
            Find the same song there before requesting it.
          </p>
        )}
        <div className="linked-title-fields">
          <label>
            Song title
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What’s the song called?"
            />
          </label>
          <label>
            Artist <span>(optional)</span>
            <input
              maxLength={120}
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Who’s it by?"
            />
          </label>
        </div>
        <p className="live-search-hint">
          The title and artist are provided by you. Aux validates the service
          and link format, but does not verify song availability or match songs
          across services.
        </p>
        {error && (
          <p className="connection-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary"
          type="submit"
          disabled={busy || locked}
        >
          <Link2 size={15} />
          {busy ? "Saving request…" : "Add song request"}
        </button>
        {locked && (
          <p className="live-search-hint">
            {room.ended
              ? "This session has ended."
              : "The host has paused new requests."}
          </p>
        )}
      </form>
    </section>
  );
}
