import { useEffect, useMemo, useRef, useState } from "react";
import { orderTracks, trackTitle } from "../data/trackOrdering";
import Icon from "./Icon";

export default function TrackList({
  tracks,
  selectedTrack,
  playingTrack,
  queuedTrack,
  autoplay,
  onAutoplayChange,
  undoEffect,
  disabled,
  sortMode = "alpha-asc",
  dynamicFirst = true,
  hideTests = false,
  pinned,
  names,
  onPlay,
  onStopThenPlay,
  onAddToQueue,
  onCollapse,
  onNavigateToControls,
}) {
  const [menuTrack, setMenuTrack] = useState(null);
  const rootRef = useRef(null);

  const orderedNames = useMemo(() => orderTracks(tracks, {
    sortMode, dynamicFirst, hideTests, pinned, names,
  }), [tracks, sortMode, dynamicFirst, hideTests, pinned, names]);

  const titleFor = (name) => trackTitle(name, tracks[name], names);

  useEffect(() => {
    if (!menuTrack) return undefined;
    const closeMenu = (event) => {
      if (!rootRef.current?.contains(event.target)) setMenuTrack(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [menuTrack]);

  const runAction = (action, name, { navigate = true } = {}) => {
    action?.(name);
    setMenuTrack(null);
    if (navigate) onNavigateToControls?.();
  };

  const activateFromPointer = (event, name) => {
    if (event.pointerType === "touch" || event.pointerType === "pen") runAction(onPlay, name);
  };

  return (
    <section className="track-library" ref={rootRef} aria-label="Track library">
      <div className="track-library__heading">
        <span className="track-library__heading-copy">
          <Icon name="library" size={18} />
          <strong>Track Library</strong>
          <small>{orderedNames.length}</small>
        </span>
        <button type="button" className="track-library__collapse" onClick={onCollapse} aria-label="Collapse track library" title="Collapse track library">
          <Icon name="chevronLeft" size={18} />
        </button>
      </div>
          <button
            type="button"
            className={`track-browser__autoplay ${autoplay ? "is-on" : ""}`}
            onClick={() => onAutoplayChange?.(!autoplay)}
            disabled={disabled}
            aria-pressed={autoplay}
            title={autoplay ? "Auto-Play is ON" : "Auto-Play is OFF"}
          >
            <span className="track-browser__autoplay-copy">
              <Icon name={autoplay ? "autoplayOn" : "autoplayOff"} size={19} />
              <span>Auto-Play</span>
            </span>
            <strong>{autoplay ? "On" : "Off"}</strong>
          </button>
          <div className="track-browser__list">
            {orderedNames.map((name) => {
              const track = tracks[name];
              const isPlaying = playingTrack === name;
              const isQueued = queuedTrack === name;
              const tags = [
                pinned?.has(name) && "Pinned",
                track?.test && "Test",
                track?.simple === false && "Dynamic",
              ].filter(Boolean);

              return (
                <div className={`track-browser__row ${selectedTrack === name ? "is-selected" : ""} ${isPlaying ? "is-playing" : ""} ${undoEffect?.kind === "track" && undoEffect?.next === name ? "is-undoing" : ""}`} key={name}>
                  <button
                    type="button"
                    className="track-browser__quick-action"
                    disabled={disabled}
                    onClick={() => runAction(onPlay, name)}
                    aria-label={`${autoplay ? "Play" : "Load"} ${titleFor(name)}`}
                    title={autoplay ? "Play track" : "Load track"}
                  >
                    <Icon name={autoplay ? "play" : "chevronRight"} size={16} />
                  </button>
                  <button
                    type="button"
                    className="track-browser__track"
                    disabled={disabled}
                    onPointerUp={(event) => activateFromPointer(event, name)}
                    onDoubleClick={() => runAction(onPlay, name)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        runAction(onPlay, name);
                      }
                    }}
                    title="Double-click to play"
                  >
                    <span className="track-browser__track-copy">
                      <strong>{titleFor(name)}</strong>
                      {tags.length > 0 && <small>{tags.join(" · ")}</small>}
                    </span>
                    <span className="track-browser__state">
                      {isPlaying && <span>Playing</span>}
                      {isQueued && <span>Queued</span>}
                    </span>
                  </button>

                  <div className="track-browser__menu-wrap">
                    <button
                      type="button"
                      className="track-browser__kebab"
                      disabled={disabled}
                      onClick={() => setMenuTrack(current => current === name ? null : name)}
                      aria-label={`Actions for ${titleFor(name)}`}
                      aria-expanded={menuTrack === name}
                    >
                      <Icon name="moreVertical" size={18} />
                    </button>
                    {menuTrack === name && (
                      <div className="track-browser__menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => runAction(onPlay, name)}>{autoplay ? "Play" : "Load"} after ending current track</button>
                        <button type="button" role="menuitem" onClick={() => runAction(onStopThenPlay, name)}>{autoplay ? "Play" : "Load"} after stopping current track</button>
                        <button type="button" role="menuitem" onClick={() => runAction(onAddToQueue, name, { navigate: false })}>Add to queue</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="track-browser__hint">Tap a track on mobile · Double-click on desktop</div>
    </section>
  );
}
