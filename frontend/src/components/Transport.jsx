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
  isSimpleTrackPlaying, // boolean, true if currently playing track is "simple"
  unlockAudio,
  rightControl,
}) {
  return (
    <section className="transport-row">
      <div className="transport-controls">
        {/* Undo the most recently queued change */}
        <button
          onClick={() => onUndo?.()}
          title={undoDisabled ? "Nothing queued to undo" : "Undo last queued change"}
          aria-label="Undo last queued change"
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
          style={{
            width: 40, height: 40, borderRadius: "50%",
            border: "1px solid #555",
            background: (isPlaying && isSimpleTrackPlaying && !stopDisabled) ? "#B34745" : "#363119",
            color: "white",
            opacity: stopDisabled ? 0.4 : 1,
            cursor: (disabled || stopDisabled || !isPlaying) ? "not-allowed" : "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center"
          }}
        >
          <Icon name="stop" size={18} />
        </button>
      </div>
      {rightControl && <div className="transport-side-control">{rightControl}</div>}
    </section>
  );
}
