import { useState } from "react";
import { zhTW } from "../i18n/zh-TW";
import { useModalFocus } from "../lib/accessibility";

interface GuideDialogProps {
  onClose: () => void;
}

const stepSymbols = ["＋", "↕", "▦", "⌕"] as const;

export function GuideDialog({ onClose }: GuideDialogProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const dialogRef = useModalFocus<HTMLElement>(true, onClose);
  const steps = zhTW.guide.steps;
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="dialog guide-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">{zhTW.guide.eyebrow}</p>
            <h2 id="guide-title">{zhTW.guide.title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={zhTW.guide.closeLabel}
          >
            ×
          </button>
        </div>

        <div className="guide-progress" aria-label={zhTW.guide.stepProgress(stepIndex + 1, steps.length)}>
          <strong aria-live="polite">{zhTW.guide.stepProgress(stepIndex + 1, steps.length)}</strong>
          <div aria-hidden="true">
            {steps.map((item, index) => (
              <span key={item.title} className={index === stepIndex ? "active" : ""} />
            ))}
          </div>
        </div>

        <article className="guide-page" key={step.title}>
          <div className={`guide-illustration guide-illustration-${stepIndex + 1}`} aria-hidden="true">
            <span>{stepSymbols[stepIndex]}</span>
            <i />
            <i />
            <i />
          </div>
          <div className="guide-copy">
            <h3>{step.title}</h3>
            <p>{step.description}</p>
            <ul>
              {step.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
          </div>
        </article>

        <div className="dialog-actions guide-actions">
          <button
            type="button"
            className="button secondary"
            disabled={isFirst}
            onClick={() => setStepIndex((current) => current - 1)}
          >
            {zhTW.guide.previous}
          </button>
          {isLast ? (
            <button type="button" className="button primary" onClick={onClose}>
              {zhTW.guide.complete}
            </button>
          ) : (
            <button
              type="button"
              className="button primary"
              onClick={() => setStepIndex((current) => current + 1)}
            >
              {zhTW.guide.next}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
