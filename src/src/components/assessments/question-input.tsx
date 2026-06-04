"use client";

/**
 * Phase C — QuestionInput shared component.
 *
 * Renders the appropriate input control for each question type:
 *   SLIDER_LIKERT  → discrete radiogroup (one radio per scale value) with anchor labels
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
    const { min, max, step, anchorMin, anchorMax } = q.scale;
    const values: number[] = [];
    for (let v = min; v <= max; v += step) values.push(v);
    const selected = typeof value === "number" ? value : undefined;
    return (
      <div className="survey-scale" role="radiogroup" aria-label={q.label}>
        <div className="survey-scale-options">
          {values.map((v) => {
            const isSel = selected === v;
            const ariaLabel =
              v === min ? `${v} — ${anchorMin}` : v === max ? `${v} — ${anchorMax}` : String(v);
            return (
              <label
                key={v}
                className={`survey-scale-option${isSel ? " is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name={`q-${q.stableKey}`}
                  className="survey-scale-radio"
                  value={v}
                  checked={isSel}
                  aria-label={ariaLabel}
                  onChange={() => onChange(q.stableKey, v)}
                  disabled={disabled}
                />
                <span className="survey-scale-num" aria-hidden="true">{v}</span>
              </label>
            );
          })}
        </div>
        <div className="survey-scale-anchors">
          <span>{anchorMin}</span>
          <span>{anchorMax}</span>
        </div>
      </div>
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
