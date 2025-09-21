export default function Transport({
  isPlaying,
  onPlay,
  onStop,
  playDisabled = false,
  stopStyle,
  controlSize = 36, // NEW: consistent control height
}) {
  const baseBtn = {
    borderRadius: 8,
    border: "1px solid #555",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: controlSize,              // match volume button height
    padding: "0 18px",               // keep your width feel
  };

  return (
    <div style={{ marginTop: 0 }}>
      {!isPlaying ? (
        <button
          onClick={onPlay}
          disabled={playDisabled}
          style={{
            ...baseBtn,
            background: "#18a3ff",       // same as progress bar color
            color: "black",
            cursor: playDisabled ? "not-allowed" : "pointer",
            opacity: playDisabled ? 0.7 : 1,
            fontSize: 18,
          }}
          aria-label="Play"
          title="Play"
        >
          ⏵
        </button>
      ) : (
        <button
          onClick={onStop}
          style={{
            ...baseBtn,
            background: "#ad2f49",
            color: "white",
            cursor: "pointer",
            fontSize: 16,
            ...(stopStyle || {}),
          }}
          aria-label="Stop"
          title="Stop"
        >
          ⏹
        </button>
      )}
    </div>
  );
}
