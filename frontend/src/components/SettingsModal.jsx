import { useEffect, useRef } from "react";
import Icon from "./Icon";

export default function SettingsModal({
  open,
  onClose,
  fadeOutSeconds, setFadeOutSeconds,
  pauseFadeSeconds, setPauseFadeSeconds,
  showStatus, setShowStatus,
  canAccessDatabase,
  onOpenDatabase,
  onUnlockIcon,
}) {
  const overlayRef = useRef(null);
  const mouseDownOnOverlay = useRef(false);
  const titleTapCount = useRef(0);
  const titleTapResetTimer = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => () => clearTimeout(titleTapResetTimer.current), []);

  function handleTitleTap() {
    clearTimeout(titleTapResetTimer.current);
    titleTapCount.current += 1;
    if (titleTapCount.current >= 5) {
      titleTapCount.current = 0;
      onUnlockIcon?.();
      return;
    }
    titleTapResetTimer.current = setTimeout(() => { titleTapCount.current = 0; }, 2200);
  }

  function setClampedNumber(rawValue, setter) {
    const value = Number(rawValue);
    if (Number.isFinite(value)) setter?.(Math.max(0, Math.min(30, value)));
  }

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="settings-overlay"
      onMouseDown={(event) => { mouseDownOnOverlay.current = event.target === overlayRef.current; }}
      onMouseUp={(event) => {
        if (event.target === overlayRef.current && mouseDownOnOverlay.current) onClose?.();
        mouseDownOnOverlay.current = false;
      }}
      aria-modal="true"
      aria-labelledby="settings-title"
      role="dialog"
    >
      <section className="settings-modal" onClick={(event) => event.stopPropagation()}>
        <header className="settings-modal__header">
          <div>
            <h2 id="settings-title" onClick={handleTitleTap}>Settings</h2>
            <p>Personalize playback and manage your music library</p>
          </div>
          <button className="database-icon-button" onClick={onClose} aria-label="Close settings">
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="settings-modal__body">
          <section className="settings-group">
            <div className="settings-group__heading">
              <span className="settings-group__icon"><Icon name="mixer" size={18} /></span>
              <div>
                <h3>Playback</h3>
                <p>Control how audio transitions behave.</p>
              </div>
            </div>

            <label className="settings-field">
              <span className="settings-field__copy">
                <strong>Fade-out on Stop</strong>
                <small>0 is instantaneous; maximum 30 seconds.</small>
              </span>
              <span className="settings-number">
                <input
                  type="number" min={0} max={30} step={0.1}
                  value={fadeOutSeconds}
                  onChange={(event) => setClampedNumber(event.target.value, setFadeOutSeconds)}
                  aria-label="Fade-out on Stop in seconds"
                />
                <span>sec</span>
              </span>
            </label>

            <label className="settings-field">
              <span className="settings-field__copy">
                <strong>Pause fade</strong>
                <small>Length of the fade when playback is paused.</small>
              </span>
              <span className="settings-number">
                <input
                  type="number" min={0} max={30} step={0.1}
                  value={pauseFadeSeconds}
                  onChange={(event) => setClampedNumber(event.target.value, setPauseFadeSeconds)}
                  aria-label="Pause fade in seconds"
                />
                <span>sec</span>
              </span>
            </label>
          </section>

          <section className="settings-group">
            <div className="settings-group__heading">
              <span className="settings-group__icon"><Icon name="eye" size={18} /></span>
              <div>
                <h3>Interface</h3>
                <p>Choose what appears while you listen.</p>
              </div>
            </div>

            <label className="settings-field settings-field--toggle">
              <span className="settings-field__copy">
                <strong>Show status bar</strong>
                <small>Display the current loading and playback state.</small>
              </span>
              <span className="settings-switch">
                <input
                  type="checkbox"
                  checked={!!showStatus}
                  onChange={(event) => setShowStatus?.(event.target.checked)}
                />
                <span aria-hidden="true" />
              </span>
            </label>
          </section>

          {canAccessDatabase && (
            <section className="settings-group settings-group--library">
              <button type="button" className="settings-database" onClick={onOpenDatabase}>
                <span className="settings-database__icon"><Icon name="archive" size={20} /></span>
                <span className="settings-database__copy">
                  <strong>Database</strong>
                  <small>Organize tracks and customize display names.</small>
                </span>
                <span className="settings-database__arrow" aria-hidden="true">›</span>
              </button>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
