import Icon from "./Icon";

export default function VolumeControl({ expanded, onExpandedChange, volume, onVolumeChange, muted, onMutedChange }) {
  const percent = Math.round(volume * 100);

  return (
    <section className={`volume-control ${expanded ? "is-open" : ""}`} title="This affects only your device" aria-label="Device volume">
      <div className="volume-control__details" aria-hidden={!expanded}>
        <span className="volume-control__value" aria-hidden="true">{percent}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
          tabIndex={expanded ? 0 : -1}
          aria-label="Your volume"
          aria-valuetext={`${percent} percent`}
        />
      </div>

      <button
        type="button"
        className="volume-control__button volume-control__expand"
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse volume control" : "Expand volume control"}
        title={expanded ? "Collapse volume" : "Adjust volume"}
      >
        <Icon name={expanded ? "chevronRight" : "chevronLeft"} size={17} />
      </button>

      <button
        type="button"
        className={`volume-control__button volume-control__mute ${muted ? "is-muted" : ""}`}
        onClick={() => onMutedChange(!muted)}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        title={muted ? "Unmute" : "Mute"}
      >
        <Icon name={muted ? "volumeMute" : volume < 0.5 ? "volumeLow" : "volume"} size={19} />
      </button>
    </section>
  );
}
