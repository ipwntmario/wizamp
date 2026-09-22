import Icon from "./Icon";

export default function PrimaryPlaybackButton({
  compact = false,
  disabled = false,
  isLoadingTrack,
  isPlaying,
  isPaused,
  onPlay,
  onPause,
  onResume,
  unlockAudio,
}) {
  const isDisabled = disabled || isLoadingTrack;
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

  const size = compact ? 30 : 52;
  const background = compact
    ? "transparent"
    : (disabled && !isLoadingTrack)
      ? "#2D2D2D"
      : isLoadingTrack
        ? "#5C5C50"
        : (isPlaying ? "#363119" : "#E0C766");
  const color = compact
    ? (isDisabled ? "rgba(255,255,255,.32)" : "#fff")
    : (disabled && !isLoadingTrack)
      ? "rgba(255,255,255,.3)"
      : isLoadingTrack
        ? "#888"
        : (isPlaying ? "white" : "black");

  return (
    <button
      type="button"
      className={`primary-playback-button ${compact ? "is-compact" : ""}`}
      onClick={handlePrimary}
      disabled={isDisabled}
      title={primaryTitle}
      aria-label={primaryTitle}
      style={{
        width: size, height: size, borderRadius: compact ? 6 : "50%",
        border: compact ? 0 : "1px solid #555",
        background,
        color,
        fontSize: compact ? 14 : 18,
        cursor: isDisabled ? "not-allowed" : "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {isLoadingTrack ? (
        <span className="loading-indicator"><Icon name="loading" size={compact ? 15 : 20} /></span>
      ) : (
        <Icon name={primaryIcon} size={compact ? 15 : 22} />
      )}
    </button>
  );
}
