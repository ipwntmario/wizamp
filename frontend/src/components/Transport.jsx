import Icon from "./Icon";
import PrimaryPlaybackButton from "./PrimaryPlaybackButton";

export default function Transport({
  disabled = false,
  primaryDisabled = false,
  stopDisabled = false,
  isLoadingTrack,
  isPlaying,
  isPaused,
  onPlay,      // () => void
  onPause,     // () => void
  onResume,    // () => void
  onStop,      // () => void
  onUndo,
  undoDisabled = true,
  undoLabel = "Undo last queued change",
  isStopHighlighted, // simple tracks or dynamic tracks with no ending section
  unlockAudio,
  rightControl,
}) {
  return (
    <section className="transport-row">
      <div className="transport-controls">
        {/* Undo the most recent reversible playback or queue action */}
        <button
          onClick={() => onUndo?.()}
          title={undoDisabled ? "Nothing to undo" : undoLabel}
          aria-label={undoLabel}
          disabled={disabled || undoDisabled}
          className="transport-undo"
        >
          <Icon name="undo" size={20} />
        </button>

        {/* Play/Pause/Resume */}
        <PrimaryPlaybackButton
          disabled={disabled || primaryDisabled}
          isLoadingTrack={isLoadingTrack}
          isPlaying={isPlaying}
          isPaused={isPaused}
          onPlay={onPlay}
          onPause={onPause}
          onResume={onResume}
          unlockAudio={unlockAudio}
        />

        {/* Stop */}
        <button
          onClick={() => { if (!disabled && !stopDisabled && isPlaying) onStop?.(); }}
          title="Stop"
          disabled={disabled || stopDisabled || !isPlaying}
          className={`transport-stop ${isPlaying && isStopHighlighted && !stopDisabled ? "is-highlighted" : ""}`}
        >
          <Icon name="stop" size={18} />
        </button>
      </div>
      {rightControl && <div className="transport-side-control">{rightControl}</div>}
    </section>
  );
}
