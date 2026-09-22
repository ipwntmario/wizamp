import { useEffect, useId, useState } from "react";
import Icon from "./Icon";

export default function QueueIndicator({ currentTrack, queuedTrack, titleFor, expandable = true, onActivate, navigationControl }) {
  const [open, setOpen] = useState(false);
  const itemsId = useId();
  const currentTitle = currentTrack ? titleFor(currentTrack) : "No track loaded";
  const queuedTitle = queuedTrack ? titleFor(queuedTrack) : "Queue empty";

  useEffect(() => {
    if (!expandable) setOpen(false);
  }, [expandable]);

  const handleClick = () => {
    if (expandable) {
      setOpen(value => !value);
      return;
    }
    onActivate?.();
  };

  return (
    <section className={`queue-indicator ${open ? "is-open" : ""} ${expandable ? "" : "is-navigation"}`} aria-label="Playback queue">
      <div className="queue-indicator__top-row">
        <button
          type="button"
          className="queue-indicator__toggle"
          onClick={handleClick}
          aria-expanded={expandable ? open : undefined}
          aria-controls={expandable ? itemsId : undefined}
        >
          <span className="queue-indicator__label">Track</span>
          <span className="queue-indicator__current">{currentTitle}</span>
          {expandable && <Icon name={open ? "chevronDown" : "chevronUp"} size={17} />}
        </button>
        {!expandable && navigationControl && (
          <div className="queue-indicator__navigation-control">{navigationControl}</div>
        )}
      </div>
      <div id={itemsId} className="queue-indicator__items" aria-hidden={!open || !expandable}>
        <div className={`queue-indicator__item is-queued ${queuedTrack ? "has-track" : ""}`}>
          <small>Up next</small>
          <strong>{queuedTitle}</strong>
        </div>
      </div>
    </section>
  );
}
