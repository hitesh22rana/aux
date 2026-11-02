"use client";
import { useState } from "react";
import { ArrowRight, Check, Music2, Plus, Search, X } from "lucide-react";
import { catalog } from "../model/catalog";
import type { RoomAction, RoomView } from "../model/contracts";
import { Art, ProviderMark } from "./music-art";
interface DemoDiscoveryProps {
  room: RoomView;
  busy: boolean;
  isHost: boolean;
  expanded: boolean;
  onAction: (action: RoomAction) => Promise<void>;
  onBrowse: () => void;
}
export function DemoDiscovery({
  room,
  busy,
  isHost,
  expanded,
  onAction,
  onBrowse,
}: DemoDiscoveryProps) {
  const [query, setQuery] = useState("");
  const [mood, setMood] = useState("For everyone");
  const filtered = catalog.filter(
    (t) =>
      (mood === "For everyone" || t.mood === mood) &&
      `${t.title} ${t.artist} ${t.album}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="discover-section">
      <div className="section-heading">
        <div>
          <h2>{expanded ? "Find a song" : "Add to the soundtrack"}</h2>
          <p>Find a favorite. Make it everyone’s favorite.</p>
        </div>
        <span className="catalog-label">Demo collection</span>
      </div>
      <div className="search-field">
        <Search size={18} />
        <input
          id="demo-song-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs, artists, or albums"
          aria-label="Search songs"
          enterKeyHint="search"
        />
        {query ? (
          <button
            className="icon-button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
          >
            <X size={16} />
          </button>
        ) : (
          <span className="search-hint">
            <Music2 size={14} />
          </span>
        )}
      </div>
      <div className="mood-tabs" aria-label="Filter songs by mood">
        {[
          "For everyone",
          "Feel good",
          "Indie favorites",
          "Desi favorites",
          "Throwbacks",
          "After dark",
        ].map((m) => (
          <button
            key={m}
            aria-pressed={m === mood}
            className={m === mood ? "active" : ""}
            onClick={() => setMood(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <div className={expanded ? "song-grid expanded" : "song-grid"}>
        {filtered.slice(0, expanded || query ? 12 : 4).map((t) => {
          const added =
            room.queue.some((q) => q.trackId === t.id) || room.current === t.id;
          return (
            <article className="song-card" key={t.id}>
              <div className="song-art-wrap">
                <Art track={t} size={280} />
                <span className="art-provider">
                  <ProviderMark provider={t.provider} small />
                </span>
                <button
                  className={`add-song ${added ? "added" : ""}`}
                  aria-label={
                    added
                      ? `${t.title} already queued`
                      : `Add ${t.title} to queue`
                  }
                  disabled={
                    added || busy || room.ended || (!isHost && room.locked)
                  }
                  onClick={() => onAction({ type: "add", trackId: t.id })}
                >
                  {added ? <Check size={18} /> : <Plus size={20} />}
                </button>
              </div>
              <h3 title={t.title}>{t.title}</h3>
              <p title={t.artist}>{t.artist}</p>
            </article>
          );
        })}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <Search size={25} />
          <h3>No songs found.</h3>
          <p>Try another artist or choose a different mood.</p>
          <button
            className="text-button"
            onClick={() => {
              setQuery("");
              setMood("For everyone");
            }}
          >
            Reset search
          </button>
        </div>
      )}
      <button
        className="browse-more"
        onClick={() => {
          onBrowse();
          setQuery("");
          setMood("For everyone");
        }}
      >
        {expanded ? "Back to the room" : "Explore the whole collection"}
        <ArrowRight size={15} />
      </button>
    </section>
  );
}
