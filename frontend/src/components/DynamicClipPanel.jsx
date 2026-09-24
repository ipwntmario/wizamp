import ClipProgress from "./ClipProgress";
import Icon from "./Icon";

export default function DynamicClipPanel({ expanded, onExpandedChange, progress }) {
  if (!expanded) {
    return (
      <button
        type="button"
        className="dynamic-clips-restore"
        onClick={() => onExpandedChange?.(true)}
        aria-label="Show clip progress"
        title="Show clip progress"
      >
        <Icon name="chevronUp" size={14} />
      </button>
    );
  }

  return (
    <section className="dynamic-clips" aria-label="Clip progress">
      <header className="dynamic-clips__heading">
        <span>Clips</span>
        <button type="button" onClick={() => onExpandedChange?.(false)} aria-label="Hide clip progress" title="Hide clip progress">
          <Icon name="chevronDown" size={15} />
        </button>
      </header>
      <div className="dynamic-clips__body">
        <ClipProgress progress={progress} />
      </div>
    </section>
  );
}
