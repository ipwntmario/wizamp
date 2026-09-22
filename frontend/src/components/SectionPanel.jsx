import { useLayoutEffect, useMemo, useRef, useState } from "react";

function toArray(value) {
  return Array.isArray(value) ? value : (value ? [value] : []);
}

export default function SectionPanel({
  sections,
  disabled = false,
  replacementLocked = false,
  currentSectionName,
  queuedSectionName,
  autoLockedTargets = [],
  onToggleQueuedSection,
  largeButtons = false,
  currentModeName = "base",
  queuedModeName = null,
  undoEffect = null,
  onToggleQueuedMode = () => {},
  getBaseModeLabel = () => "base",
  getSectionTitle,
  getSectionButtonLabel,
  getModeLabel,
}) {
  const rootRef = useRef(null);
  const [reservedHeights, setReservedHeights] = useState({ sections: 0, modes: 0 });
  const current = sections[currentSectionName];

  const layouts = useMemo(() => Object.entries(sections).map(([sectionKey, section]) => ({
    sectionKey,
    nextSections: toArray(section?.nextSection),
    modes: toArray(section?.modes).length > 0 ? ["base", ...toArray(section?.modes)] : [],
  })), [sections]);

  const hasSectionControls = layouts.some(layout => layout.nextSections.length > 0);
  const hasModeControls = layouts.some(layout => layout.modes.length > 0);

  const sectionLabel = (name) => (
    (getSectionButtonLabel && getSectionButtonLabel(name))
    ?? sections?.[name]?.defaultButtonName
    ?? (getSectionTitle ? getSectionTitle(name) : (sections?.[name]?.defaultDisplayName ?? name))
    ?? name
  );

  const modeLabel = (sectionKey, mode) => (
    getModeLabel
      ? getModeLabel(sectionKey, mode === "base" ? "__base__" : mode)
      : (mode === "base" ? (getBaseModeLabel(sectionKey) || "base") : mode)
  );

  const measurementSignature = layouts.map(layout => [
    ...layout.nextSections.map(sectionLabel),
    ...layout.modes.map(mode => modeLabel(layout.sectionKey, mode)),
  ].join("\u0001")).join("\u0002");

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    let frame = 0;
    const applyMeasurement = () => {
      const maximumHeight = (selector) => Math.ceil(Math.max(
        0,
        ...Array.from(root.querySelectorAll(selector), element => element.getBoundingClientRect().height),
      ));
      const next = {
        sections: maximumHeight("[data-measure-sections]"),
        modes: maximumHeight("[data-measure-modes]"),
      };
      setReservedHeights(previous => (
        previous.sections === next.sections && previous.modes === next.modes ? previous : next
      ));
    };
    const scheduleMeasurement = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(applyMeasurement);
    };

    applyMeasurement();
    const observer = new ResizeObserver(scheduleMeasurement);
    observer.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [layouts, largeButtons, measurementSignature]);

  if (!current) return null;

  const nextSections = toArray(current.nextSection);
  const extraModes = toArray(current.modes);
  const modes = extraModes.length > 0 ? ["base", ...extraModes] : [];

  const buttonSizeClass = largeButtons ? " is-large" : "";

  return (
    <div className={`section-controls ${replacementLocked ? "is-replacement-locked" : ""}`} ref={rootRef}>
      {hasModeControls && (
        <section className="section-controls__region" aria-label="Modes">
          <div className="section-controls__heading">Modes</div>
          <div className="section-controls__body" style={{ minHeight: reservedHeights.modes || undefined }}>
            <div className="section-controls__buttons section-controls__buttons--modes">
              {modes.map((mode) => {
                const isActive = currentModeName === mode;
                const isQueued = queuedModeName === mode && !isActive;
                const label = modeLabel(currentSectionName, mode);
                return (
                  <button
                    className={`section-control-button section-control-button--mode${buttonSizeClass}${isActive ? " is-active" : ""}${isQueued ? " is-queued" : ""}${undoEffect?.kind === "mode" && undoEffect?.next === mode ? " is-undoing" : ""}`}
                    key={mode}
                    disabled={disabled}
                    onClick={() => {
                      if (disabled || isActive) return;
                      onToggleQueuedMode(isQueued ? null : mode);
                    }}
                    style={{ cursor: isActive ? "default" : undefined }}
                    title={label}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="section-controls__measurement" aria-hidden="true">
              {layouts.map(layout => (
                <div className="section-controls__buttons section-controls__buttons--modes" data-measure-modes key={layout.sectionKey}>
                  {layout.modes.map(mode => (
                    <button className={`section-control-button section-control-button--mode${buttonSizeClass}`} tabIndex={-1} key={mode}>
                      {modeLabel(layout.sectionKey, mode)}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {hasSectionControls && (
        <section className="section-controls__region" aria-label="Section transitions">
          <div className="section-controls__heading section-controls__heading--section">
            <span>Sections</span>
            <strong>{getSectionTitle ? getSectionTitle(currentSectionName) : (current?.defaultDisplayName ?? currentSectionName)}</strong>
            <span aria-hidden="true" />
          </div>
          <div className="section-controls__body" style={{ minHeight: reservedHeights.sections || undefined }}>
            <div className="section-controls__buttons section-controls__buttons--sections">
              {nextSections.map((name) => {
                const isQueued = queuedSectionName === name;
                const isAutoLocked = autoLockedTargets.includes(name);
                const isEnd = sections[name]?.type === "end";

                const titleText = getSectionTitle
                  ? getSectionTitle(name)
                  : (sections[name]?.defaultDisplayName ?? name);

                return (
                  <button
                    className={`section-control-button section-control-button--section${buttonSizeClass}${isEnd ? " is-end" : ""}${isQueued ? " is-queued" : ""}${isAutoLocked ? " is-auto-locked" : ""}${undoEffect?.kind === "section" && undoEffect?.next === name ? " is-undoing" : ""}`}
                    key={name}
                    disabled={disabled || isAutoLocked}
                    onClick={() => {
                      if (disabled || isAutoLocked) return;
                      onToggleQueuedSection(isQueued ? null : name);
                    }}
                    title={titleText}
                  >
                    {sectionLabel(name)}
                  </button>
                );
              })}
            </div>

            <div className="section-controls__measurement" aria-hidden="true">
              {layouts.map(layout => (
                <div className="section-controls__buttons section-controls__buttons--sections" data-measure-sections key={layout.sectionKey}>
                  {layout.nextSections.map(name => (
                    <button className={`section-control-button section-control-button--section${buttonSizeClass}`} tabIndex={-1} key={name}>
                      {sectionLabel(name)}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

    </div>
  );
}
