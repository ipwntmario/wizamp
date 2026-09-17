export default function Transport({
  disabled = false,
  isLoadingTrack,
  isPlaying,
  isPaused,
  onPlay,      // () => void
  onPause,     // () => void
  onResume,    // () => void
  onStop,      // () => void
  autoplay,
  setAutoplay,
  isSimpleTrackPlaying, // boolean, true if currently playing track is "simple"
  unlockAudio,
}) {
  const primaryIcon = isLoadingTrack ? "loading" : (isPlaying ? "pause" : "play");
  const primaryTitle = isLoadingTrack
    ? "Loading… please wait"
    : (isPlaying ? "Pause" : (isPaused ? "Resume" : "Play"));

  const handlePrimary = () => {
    unlockAudio?.();
    if (disabled || isLoadingTrack) return;
    if (isPlaying) onPause?.();
    else if (isPaused) onResume?.();
    else onPlay?.();
  };

  return (
    <section style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Auto-Play toggle */}
        <button
          onClick={() => setAutoplay?.(a => !a)}
          title={autoplay ? "Auto-Play is ON" : "Auto-Play is OFF"}
          aria-pressed={autoplay}
          disabled={disabled}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            border: "1px solid #5C5C50",
            background: autoplay ? "#9C9160" : "#363119",
            color: "white",
            cursor: disabled ? "not-allowed" : "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center"
          }}
        >
          <Icon name={autoplay ? "autoplayOn" : "autoplayOff"} size={20} />
        </button>

        {/* Play/Pause/Resume */}
        <button
          onClick={handlePrimary}
          disabled={disabled || isLoadingTrack}
          title={primaryTitle}
          style={{
            width: 52, height: 52, borderRadius: "50%",
            border: "1px solid #555",
            background: isLoadingTrack ? "#5C5C50"
                      : (isPlaying ? "#363119"
                      : (isPaused ? "#E0C766" : "#E0C766")),
            color: isLoadingTrack ? "#888" : (isPlaying ? "white" : "black"),
            fontSize: 18,
            cursor: (disabled || isLoadingTrack) ? "not-allowed" : "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {isLoadingTrack ? (
            <span className="loading-indicator"><Icon name="loading" size={20} /></span>
          ) : (
            <Icon name={primaryIcon} size={22} />
          )}
        </button>

        {/* Stop */}
        <button
          onClick={() => { if (!disabled && isPlaying) onStop?.(); }}
          title="Stop"
          disabled={disabled || !isPlaying}
          style={{
            width: 40, height: 40, borderRadius: "50%",
            border: "1px solid #555",
            background: (isPlaying && isSimpleTrackPlaying) ? "#B34745" : "#363119",
            color: "white",
            cursor: (disabled || !isPlaying) ? "not-allowed" : "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center"
          }}
        >
          <Icon name="stop" size={18} />
        </button>
      </div>
    </section>
  );
}
import Icon from "./Icon";
