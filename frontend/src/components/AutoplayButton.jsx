import Icon from "./Icon";

export default function AutoplayButton({ enabled, onToggle, disabled = false }) {
  return (
    <button
      type="button"
      className={`autoplay-button ${enabled ? "is-on" : ""}`}
      aria-label={`Auto-Play ${enabled ? "on" : "off"}`}
      aria-pressed={enabled}
      title={`Auto-Play ${enabled ? "on" : "off"}`}
      disabled={disabled}
      onClick={() => onToggle?.(!enabled)}
    >
      <Icon name={enabled ? "autoplayOn" : "autoplayOff"} size={19} />
    </button>
  );
}
