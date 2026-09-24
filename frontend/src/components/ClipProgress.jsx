import { useRef, useState } from "react";

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function ClipProgress({
  progress = 0,
  positionSeconds = 0,
  durationSeconds = 0,
  showTimeline = false,
  seekable = false,
  onSeek,
}) {
  const pointerIdRef = useRef(null);
  const [dragProgress, setDragProgress] = useState(null);
  const duration = Math.max(0, Number(durationSeconds) || 0);
  const canSeek = seekable && duration > 0;
  const displayedProgress = dragProgress == null ? clamp01(progress) : dragProgress;
  const displayedPosition = dragProgress == null ? positionSeconds : dragProgress * duration;

  const progressAtPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return clamp01((event.clientX - rect.left) / rect.width);
  };

  const commitProgress = (nextProgress) => {
    if (!canSeek) return;
    onSeek?.(clamp01(nextProgress) * duration);
  };

  const accessibilityProps = canSeek ? {
    role: "slider",
    tabIndex: 0,
    "aria-label": "Track position",
    "aria-valuemin": 0,
    "aria-valuemax": Math.round(duration),
    "aria-valuenow": Math.round(Math.max(0, Number(displayedPosition) || 0)),
    "aria-valuetext": `${formatTime(displayedPosition)} of ${formatTime(duration)}`,
  } : {
    role: "progressbar",
    "aria-label": "Clip position",
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": Math.round(displayedProgress * 100),
  };

  return (
    <section className={`clip-progress-wrap ${canSeek ? "is-seekable" : ""}`}>
      <div className={`clip-progress-row ${showTimeline ? "has-timeline" : ""}`}>
        {showTimeline && <time className="clip-progress__time">{formatTime(displayedPosition)}</time>}
        <div
          className={`clip-progress ${dragProgress == null ? "" : "is-dragging"}`}
          {...accessibilityProps}
          onPointerDown={(event) => {
            if (!canSeek || event.button !== 0) return;
            event.preventDefault();
            pointerIdRef.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragProgress(progressAtPointer(event));
          }}
          onPointerMove={(event) => {
            if (pointerIdRef.current !== event.pointerId) return;
            setDragProgress(progressAtPointer(event));
          }}
          onPointerUp={(event) => {
            if (pointerIdRef.current !== event.pointerId) return;
            const nextProgress = progressAtPointer(event);
            pointerIdRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            setDragProgress(null);
            commitProgress(nextProgress);
          }}
          onPointerCancel={(event) => {
            if (pointerIdRef.current !== event.pointerId) return;
            pointerIdRef.current = null;
            setDragProgress(null);
          }}
          onKeyDown={(event) => {
            if (!canSeek) return;
            let nextPosition = Number(positionSeconds) || 0;
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") nextPosition -= 5;
            else if (event.key === "ArrowRight" || event.key === "ArrowUp") nextPosition += 5;
            else if (event.key === "Home") nextPosition = 0;
            else if (event.key === "End") nextPosition = duration;
            else return;
            event.preventDefault();
            commitProgress(nextPosition / duration);
          }}
        >
          <div className="clip-progress__fill" style={{ width: `${displayedProgress * 100}%` }} />
          {canSeek && <span className="clip-progress__thumb" style={{ left: `${displayedProgress * 100}%` }} aria-hidden="true" />}
        </div>
        {showTimeline && <time className="clip-progress__time clip-progress__time--duration">{formatTime(duration)}</time>}
      </div>
    </section>
  );
}
