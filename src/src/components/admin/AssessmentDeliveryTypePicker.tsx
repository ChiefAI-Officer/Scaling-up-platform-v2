"use client";

import type { AssessmentTemplateDeliveryType } from "@prisma/client";
import { Globe2, Mail } from "lucide-react";

import { cn } from "@/lib/utils";

export function AssessmentDeliveryTypePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: AssessmentTemplateDeliveryType | null;
  onChange: (value: AssessmentTemplateDeliveryType) => void;
  disabled?: boolean;
}) {
  const options: Array<{
    value: AssessmentTemplateDeliveryType;
    title: string;
    description: string;
    Icon: typeof Globe2;
  }> = [
    {
      value: "PUBLIC_MARKETING_QUIZ",
      title: "Public marketing quiz",
      description:
        "Anyone with the public link can participate, see immediate results, and receive the configured Marketing CTA.",
      Icon: Globe2,
    },
    {
      value: "INVITED_ASSESSMENT",
      title: "Invited assessment",
      description:
        "Named respondents receive private invitation links. Marketing CTA does not appear.",
      Icon: Mail,
    },
  ];

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-foreground">
        Assessment type
      </legend>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose how people will access this assessment. You cannot skip this
        choice.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {options.map(({ value: optionValue, title, description, Icon }) => {
          const selected = value === optionValue;
          return (
            <label
              key={optionValue}
              className={cn(
                "relative flex min-h-32 cursor-pointer gap-3 rounded-xl border bg-card p-4 transition-colors",
                selected
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-primary/50",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name="assessment-delivery-type"
                value={optionValue}
                checked={selected}
                onChange={() => onChange(optionValue)}
                disabled={disabled}
                className="mt-1 h-4 w-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Icon aria-hidden="true" className="h-4 w-4 text-primary" />
                  {title}
                </span>
                <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                  {description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
