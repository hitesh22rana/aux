"use client";
import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/shared/theme/theme-toggle";
import { ArrowRight, ArrowUpRight, AudioLines } from "lucide-react";
import styles from "./room-landing.module.css";

interface RoomLandingProps {
  ready: boolean;
  onCreate: () => void;
  onJoin: () => void;
  onAbout: () => void;
  onSessions: () => void;
}

export function RoomLanding({
  ready,
  onCreate,
  onJoin,
  onAbout,
  onSessions,
}: RoomLandingProps) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="Aux home">
          <AudioLines size={28} strokeWidth={1.6} />
          <span>
            aux<span className={styles.brandPeriod}>.</span>
          </span>
        </Link>
        <nav className={styles.navigation} aria-label="Home navigation">
          <button className={styles.join} onClick={onAbout}>
            How Aux works
          </button>
          <button className={styles.join} onClick={onJoin}>
            Join a room <ArrowUpRight size={17} />
          </button>
          <ThemeToggle />
        </nav>
      </header>
      <main id="main" className={styles.stage}>
        <div className={styles.reading}>
          <section className={styles.hero} aria-labelledby="landing-title">
            <h1 id="landing-title">
              <span>Pass</span> <span>the aux.</span>
            </h1>
            <p className={styles.description}>
              A shared music queue for your people. Everyone brings a song. You
              make the soundtrack.
            </p>
            <div className={styles.actions}>
              <div className={styles.actionButtons}>
                <button
                  className={styles.primary}
                  onClick={onCreate}
                  disabled={!ready}
                >
                  Create a room <ArrowRight size={20} />
                </button>
                <button
                  className={styles.secondary}
                  onClick={onSessions}
                  disabled={!ready}
                >
                  Your sessions
                </button>
              </div>
              <span>No account. Just a good pick.</span>
            </div>
          </section>
        </div>
        <figure className={styles.artwork}>
          <Image
            src="/images/pass-the-aux.webp"
            alt="Black headphones, a honey-orange record and a looping aux cable on a warm amber surface."
            fill
            sizes="(max-width: 760px) 100vw, 52vw"
            priority
            className={styles.image}
          />
        </figure>
      </main>
      <footer className={styles.footer}>
        <span>Made for listening together.</span>
        <span>Across multiple music services.</span>
      </footer>
    </div>
  );
}
