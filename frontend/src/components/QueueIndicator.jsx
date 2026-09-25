import { useEffect, useId, useState } from "react";
import Icon from "./Icon";

export default function QueueIndicator({ currentTrack, queuedTrack, queuedTrackProgress = null, titleFor, expandable = true, locked = false, onActivate, navigationControl }) {
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const [countdownChoice, setCountdownChoice] = useState(null);
  const itemsId = useId();
  const currentTitle = currentTrack ? titleFor(currentTrack) : "No track loaded";
  const queuedTitle = queuedTrack ? titleFor(queuedTrack) : "Queue empty";
  const countdownActive = !!queuedTrack && queuedTrackProgress != null;
  const countdownKey = `${currentTrack ?? ""}\u0000${queuedTrack ?? ""}`;
  const choice = countdownChoice?.key === countdownKey ? countdownChoice.view : null;
  const view = locked ? "collapsed" : !expandable
    ? (countdownActive && choice !== "collapsed" ? "peeking" : "collapsed")
    : countdownActive
      ? (choice ?? (manuallyExpanded ? "expanded" : "peeking"))
      : (manuallyExpanded ? "expanded" : "collapsed");
  const open = view !== "collapsed";
  const Toggle = locked ? "div" : "button";

  useEffect(() => {
    if (!countdownActive) setCountdownChoice(null);
  }, [countdownActive]);

  const chooseView = (nextView) => {
    setManuallyExpanded(nextView === "expanded");
    if (countdownActive) setCountdownChoice({ key: countdownKey, view: nextView });
  };

  const handleClick = () => {
    if (expandable) {
      chooseView(view === "expanded" ? "collapsed" : "expanded");
      return;
    }
    onActivate?.();
  };

  return (
    <section className={`queue-indicator ${open ? "is-open" : ""} ${view === "peeking" ? "is-peeking" : ""} ${expandable ? "" : "is-navigation"} ${locked ? "is-locked" : ""}`} aria-label="Playback queue">
      <div className="queue-indicator__top-row">
        <Toggle
          type={locked ? undefined : "button"}
          className="queue-indicator__toggle"
          onClick={locked ? undefined : handleClick}
          aria-expanded={!locked && expandable ? open : undefined}
          aria-controls={!locked && expandable ? itemsId : undefined}
        >
          <span className="queue-indicator__label">Track</span>
          <span className="queue-indicator__current">{currentTitle}</span>
          {!locked && expandable && view !== "peeking" && <Icon name={open ? "chevronDown" : "chevronUp"} size={17} />}
        </Toggle>
        {!locked && expandable && view === "peeking" && (
          <div className="queue-indicator__peek-controls">
            <button type="button" aria-label="Expand track queue" onClick={() => chooseView("expanded")}>
              <Icon name="chevronUp" size={15} />
            </button>
            <button type="button" aria-label="Collapse track queue" onClick={() => chooseView("collapsed")}>
              <Icon name="chevronDown" size={15} />
            </button>
          </div>
        )}
        {!locked && !expandable && navigationControl && (
          <div className="queue-indicator__navigation-control">{navigationControl}</div>
        )}
      </div>
      <div id={itemsId} className="queue-indicator__items" aria-hidden={!open}>
        <div className={`queue-indicator__item is-queued ${queuedTrack ? "has-track" : ""}`}>
          <small>Up next</small>
          <strong>{queuedTitle}</strong>
          {queuedTrack && queuedTrackProgress != null && (
            <span className="queue-indicator__queue-progress" aria-hidden="true">
              <span style={{ transform: `scaleX(${queuedTrackProgress})` }} />
            </span>
          )}
          {!locked && !expandable && open && (
            <button type="button" className="queue-indicator__item-nav" aria-label="Go to play controls" onClick={onActivate} />
          )}
        </div>
      </div>
    </section>
  );
}
