import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

export default function StatusBar({ text, history = [] }) {
  const [open, setOpen] = useState(false);
  const historyRef = useRef(null);

  useEffect(() => {
    if (open) historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight });
  }, [open, history.length]);

  return (
    <section className={`status-bar ${open ? "is-open" : ""}`} aria-label="Application status">
      <button
        type="button"
        className="status-bar__toggle"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls="status-history"
        aria-label={open ? "Close status history" : "Open status history"}
        title={open ? "Close status history" : "View status history"}
      >
        <Icon name="history" size={16} />
        <Icon name="chevronDown" size={13} />
      </button>

      <div className="status-bar__current" role="status" aria-live="polite">
        <span className="status-bar__pulse" aria-hidden="true" />
        <span className="status-bar__label">Status</span>
        <span className="status-bar__text" title={text}>{text}</span>
      </div>

      <div className="status-history" aria-hidden={!open}>
        <div className="status-history__header">
          <span>Session history</span>
          <small>{history.length} {history.length === 1 ? "update" : "updates"}</small>
        </div>
        <ol id="status-history" className="status-history__list" ref={historyRef}>
          {history.map((entry, index) => (
            <li className={index === history.length - 1 ? "is-current" : ""} key={entry.id}>
              <time dateTime={new Date(entry.timestamp).toISOString()}>{formatTime(entry.timestamp)}</time>
              <span>{entry.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
