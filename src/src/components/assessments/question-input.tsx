"use client";

/**
 * Phase C — QuestionInput shared component.
 *
 * Renders the appropriate input control for each question type:
 *   SLIDER_LIKERT  → <input type="range"> with anchor labels
 *   TEXT           → <textarea>
 *   NUMBER         → <input type="number">
 *   MULTI_CHOICE   → checkbox group (respects maxChoices)
 *   unknown        → read-only fallback
 */

interface SliderScale {
  min: number;
  max: number;
  step: number;
  anchorMin: string;
  anchorMax: string;
}

interface OptionDef {
  key: string;
  label: string;
}

export interface QuestionForInput {
  stableKey: string;
  type: string;
  label: string;
  isRequired: boolean;
  scale?: SliderScale;
  options?: OptionDef[];
  maxChoices?: number;
}

interface QuestionInputProps {
  question: QuestionForInput;
  value: number | string | string[] | undefined;
  onChange: (stableKey: string, value: number | string | string[]) => void;
  disabled?: boolean;
}

export function QuestionInput({
  question: q,
  value,
  onChange,
  disabled,
}: QuestionInputProps) {
  if (q.type === "SLIDER_LIKERT" && q.scale) {
    const numVal = typeof value === "number" ? value : q.scale.min;
    return (
      <>
        <input
          id={`q-${q.stableKey}`}
          type="range"
          min={q.scale.min}
          max={q.scale.max}
          step={q.scale.step}
          value={numVal}
          onChange={(e) => onChange(q.stableKey, Number(e.target.value))}
          className="survey-slider"
          aria-valuemin={q.scale.min}
          aria-valuemax={q.scale.max}
          aria-valuenow={numVal}
          disabled={disabled}
        />
        <div className="survey-slider-anchors">
          <span>{q.scale.anchorMin}</span>
          <span className="survey-slider-value">
            {typeof value === "number" ? value : "—"}
          </span>
          <span>{q.scale.anchorMax}</span>
        </div>
      </>
    );
  }

  if (q.type === "TEXT") {
    return (
      <textarea
        id={`q-${q.stableKey}`}
        className="survey-textarea"
        rows={3}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(q.stableKey, e.target.value)}
        disabled={disabled}
      />
    );
  }

  if (q.type === "NUMBER") {
    return (
      <input
        id={`q-${q.stableKey}`}
        type="number"
        className="survey-input-number"
        value={
          typeof value === "number"
            ? value
            : typeof value === "string"
              ? value
              : ""
        }
        onChange={(e) =>
          onChange(
            q.stableKey,
            e.target.value === "" ? "" : Number(e.target.value)
          )
        }
        disabled={disabled}
      />
    );
  }

  if (q.type === "MULTI_CHOICE" && q.options) {
    const selected: string[] = Array.isArray(value) ? value : [];
    const atMax =
      q.maxChoices !== undefined && selected.length >= q.maxChoices;
    return (
      <div
        className="survey-checkbox-group"
        role="group"
        aria-label={q.label}
      >
        {q.options.map((opt) => {
          const checked = selected.includes(opt.key);
          return (
            <label key={opt.key} className="survey-checkbox-item">
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled || (!checked && atMax)}
                onChange={() => {
                  const next = checked
                    ? selected.filter((k) => k !== opt.key)
                    : [...selected, opt.key];
                  onChange(q.stableKey, next);
                }}
              />
              {opt.label}
            </label>
          );
        })}
      </div>
    );
  }

  // Fallback for unknown types
  return (
    <p
      className="survey-question-help"
      style={{ fontStyle: "italic" }}
    >
      (This question type is not supported in this view.)
    </p>
  );
}
