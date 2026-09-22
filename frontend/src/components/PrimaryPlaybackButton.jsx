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

  return (
    <button
      type="button"
      className={`primary-playback-button ${compact ? "is-compact" : ""} ${isLoadingTrack ? "is-loading" : isPlaying ? "is-playing" : "is-ready"}`}
      onClick={handlePrimary}
      disabled={isDisabled}
      title={primaryTitle}
      aria-label={primaryTitle}
    >
      {isLoadingTrack ? (
        <span className="loading-indicator"><Icon name="loading" size={compact ? 15 : 20} /></span>
      ) : (
        <Icon name={primaryIcon} size={compact ? 15 : 22} />
      )}
    </button>
  );
}
