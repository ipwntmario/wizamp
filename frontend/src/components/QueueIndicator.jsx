import { useState } from "react";
import Icon from "./Icon";

export default function QueueIndicator({ currentTrack, queuedTrack, titleFor, expandable = true, onActivate }) {
  const [open, setOpen] = useState(false);
  const currentTitle = currentTrack ? titleFor(currentTrack) : "No track loaded";
  const queuedTitle = queuedTrack ? titleFor(queuedTrack) : "Queue empty";

  return (
    <section className={`queue-indicator ${open ? "is-open" : ""} ${expandable ? "" : "is-shortcut"}`} aria-label="Playback queue">
      <button
        type="button"
        className="queue-indicator__toggle"
        onClick={() => expandable ? setOpen(value => !value) : onActivate?.()}
        aria-expanded={expandable ? open : undefined}
        aria-controls={expandable ? "queue-indicator-items" : undefined}
      >
        <span className="queue-indicator__label">Track</span>
        <span className="queue-indicator__current">{currentTitle}</span>
        <Icon name={expandable ? (open ? "chevronDown" : "chevronUp") : "controls"} size={17} />
      </button>
      {expandable && (
        <div id="queue-indicator-items" className="queue-indicator__items" aria-hidden={!open}>
          <div className={`queue-indicator__item is-queued ${queuedTrack ? "has-track" : ""}`}>
            <small>Up next</small>
            <strong>{queuedTitle}</strong>
          </div>
        </div>
      )}
    </section>
  );
}
