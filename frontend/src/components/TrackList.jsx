import { useEffect, useMemo, useRef, useState } from "react";
import { activeTrackFilterCount, orderTracks, trackTitle } from "../data/trackOrdering";
import Icon from "./Icon";
import TrackFilterControls from "./TrackFilterControls";

function OverflowTrackTitle({ children, active }) {
  const viewportRef = useRef(null);
  const titleRef = useRef(null);
  const motionAllowed = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const marqueeActive = active && motionAllowed;

  useEffect(() => {
    if (!marqueeActive) return undefined;
    const viewport = viewportRef.current;
    const title = titleRef.current;
    if (!viewport || !title) return undefined;

    let animation;
    let measuredWidth = -1;
    const updateAnimation = () => {
      const viewportWidth = viewport.clientWidth;
      if (viewportWidth === measuredWidth) return;
      measuredWidth = viewportWidth;
      animation?.cancel();
      const distance = Math.ceil(title.scrollWidth - viewportWidth);
      if (distance <= 1) return;

      const travelMs = Math.max(2200, (distance / 18) * 1000);
      const totalMs = travelMs + 1000;
      animation = title.animate([
        { transform: "translateX(0)", offset: 0 },
        { transform: `translateX(-${distance}px)`, offset: travelMs / totalMs },
        { transform: `translateX(-${distance}px)`, offset: 1 },
      ], {
        duration: totalMs,
        iterations: Infinity,
        easing: "linear",
      });
    };
    updateAnimation();
    const observer = new ResizeObserver(updateAnimation);
    observer.observe(viewport);

    return () => { observer.disconnect(); animation?.cancel(); };
  }, [marqueeActive, children]);

  return (
    <span className="track-browser__title-viewport" ref={viewportRef}>
      <strong ref={titleRef} className={marqueeActive ? "is-marquee-active" : ""}>{children}</strong>
    </span>
  );
}

export default function TrackList({
  tracks,
  selectedTrack,
  playingTrack,
  queuedTrack,
  queuedTrackProgress = null,
  autoplay,
  onAutoplayChange,
  undoEffect,
  disabled,
  sortMode = "alpha-asc",
  filters,
  onChangeFilters,
  pinned,
  names,
  onPlay,
  onStopThenPlay,
  onAddToQueue,
  onCollapse,
  onNavigateToControls,
}) {
  const [menuTrack, setMenuTrack] = useState(null);
  const [hoveredTrack, setHoveredTrack] = useState(null);
  const [heldTrack, setHeldTrack] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const rootRef = useRef(null);
  const filterButtonRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const pointerGestureRef = useRef(null);

  const orderedNames = useMemo(() => orderTracks(tracks, {
    sortMode, filters, pinned, names,
  }), [tracks, sortMode, filters, pinned, names]);

  const titleFor = (name) => trackTitle(name, tracks[name], names);

  useEffect(() => {
    if (!menuTrack) return undefined;
    const closeMenu = (event) => {
      if (!rootRef.current?.contains(event.target)) setMenuTrack(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [menuTrack]);

  useEffect(() => () => clearTimeout(longPressTimerRef.current), []);

  const runAction = (action, name, { navigate = true } = {}) => {
    action?.(name);
    setMenuTrack(null);
    if (navigate) onNavigateToControls?.();
  };

  const startLongPress = (event, name) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    clearTimeout(longPressTimerRef.current);
    pointerGestureRef.current = {
      name,
      x: event.clientX,
      y: event.clientY,
      canceled: false,
      longPress: false,
    };
    longPressTimerRef.current = setTimeout(() => {
      const gesture = pointerGestureRef.current;
      if (!gesture || gesture.name !== name || gesture.canceled) return;
      gesture.longPress = true;
      setHeldTrack(name);
    }, 500);
  };

  const updateLongPress = (event, name) => {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.name !== name || gesture.longPress) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 10) {
      gesture.canceled = true;
      clearTimeout(longPressTimerRef.current);
    }
  };

  const finishPointer = (event, name) => {
    const gesture = pointerGestureRef.current;
    clearTimeout(longPressTimerRef.current);
    pointerGestureRef.current = null;
    setHeldTrack(null);
    if (gesture?.name === name && (event.pointerType === "touch" || event.pointerType === "pen")
        && !gesture?.longPress && !gesture?.canceled) {
      runAction(onPlay, name);
    }
  };

  const cancelLongPress = () => {
    clearTimeout(longPressTimerRef.current);
    pointerGestureRef.current = null;
    setHeldTrack(null);
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
      <div className="track-browser__toolbar">
        <button
          ref={filterButtonRef}
          type="button"
          className="track-browser__filter-button"
          aria-expanded={filtersOpen}
          aria-controls="library-filters"
          onClick={() => setFiltersOpen(value => !value)}
        >
          <Icon name="filter" size={16} />
          <span>Filters</span>
          {activeTrackFilterCount(filters) > 0 && <span className="track-browser__filter-count">{activeTrackFilterCount(filters)}</span>}
        </button>
        <label
          className={`track-browser__autoplay ${autoplay ? "is-on" : ""}`}
          title={autoplay ? "Auto-Play is ON" : "Auto-Play is OFF"}
        >
          <span className="track-browser__autoplay-copy">
            <Icon name={autoplay ? "autoplayOn" : "autoplayOff"} size={19} />
            <span>Auto-Play</span>
          </span>
          <span className="track-browser__autoplay-state">
            <strong>{autoplay ? "On" : "Off"}</strong>
            <span className="toggle-switch">
              <input type="checkbox" checked={autoplay} onChange={(event) => onAutoplayChange?.(event.target.checked)} disabled={disabled} />
              <span aria-hidden="true" />
            </span>
          </span>
        </label>
      </div>
      {filtersOpen && <TrackFilterControls
        id="library-filters"
        filters={filters}
        onChange={onChangeFilters}
        shownCount={orderedNames.length}
        totalCount={Object.keys(tracks || {}).length}
        onEscape={() => { setFiltersOpen(false); filterButtonRef.current?.focus(); }}
      />}
          <div className="track-browser__list">
            {orderedNames.length === 0 && <p className="track-browser__empty" role="status">No tracks match these filters. Change them in Library Filters.</p>}
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
                <div
                  className={`track-browser__row ${selectedTrack === name ? "is-selected" : ""} ${isPlaying ? "is-playing" : ""} ${isQueued ? "is-queued" : ""} ${undoEffect?.kind === "track" && undoEffect?.next === name ? "is-undoing" : ""}`}
                  key={name}
                  onPointerEnter={(event) => { if (event.pointerType === "mouse") setHoveredTrack(name); }}
                  onPointerLeave={(event) => { if (event.pointerType === "mouse") setHoveredTrack(null); }}
                >
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
                    onPointerDown={(event) => startLongPress(event, name)}
                    onPointerMove={(event) => updateLongPress(event, name)}
                    onPointerUp={(event) => finishPointer(event, name)}
                    onPointerCancel={cancelLongPress}
                    onContextMenu={(event) => { if (heldTrack === name) event.preventDefault(); }}
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
                      <OverflowTrackTitle active={hoveredTrack === name || heldTrack === name}>{titleFor(name)}</OverflowTrackTitle>
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
                  {isQueued && queuedTrackProgress != null && (
                    <span className="track-browser__queue-progress" aria-hidden="true">
                      <span style={{ transform: `scaleX(${queuedTrackProgress})` }} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="track-browser__hint">Tap a track on mobile · Double-click on desktop</div>
    </section>
  );
}
