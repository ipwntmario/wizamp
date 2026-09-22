import { useEffect, useRef } from "react";
import Icon from "./Icon";

const updates = [
  { title: "A cleaner foundation", detail: "Refactored playback and interface code, refreshed the app's icons, and polished the session, settings, and database panels." },
  { title: "Steadier playback controls", detail: "Reorganized the progress, section, mode, and transport areas. Section and mode spaces now hold their size as a track changes." },
  { title: "A better track library", detail: "Added a resizable desktop panel, dedicated mobile views, quick track actions, title scrolling, and clearer track and queue indicators." },
  { title: "Queue with confidence", detail: "Tracks can preload for later playback, Auto-Play respects your choice, and pending tracks, sections, and modes can be undone." },
  { title: "Useful details", detail: "Added status history, compact volume controls, subtle queued-state highlights, and clearer behavior when ending or replacing a track." },
];

export default function AboutModal({ open, onClose, iconSrc }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="about-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <button ref={closeRef} type="button" className="about-panel__close database-icon-button" onClick={onClose} aria-label="Close About Wizamp">
          <Icon name="close" size={20} />
        </button>
        <header className="about-panel__header">
          <img src={iconSrc} alt="" />
          <div>
            <p className="about-panel__eyebrow">About the app</p>
            <h2 id="about-title">Wizamp</h2>
            <span className="about-panel__version">Version 0.2</span>
          </div>
        </header>
        <div className="about-panel__body">
          <h3>What’s new in v0.2</h3>
          <p className="about-panel__intro">A more polished, flexible way to explore and play tracks.</p>
          <ul className="about-panel__updates">
            {updates.map(({ title, detail }) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
