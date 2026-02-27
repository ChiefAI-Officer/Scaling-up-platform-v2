"use client";

import * as React from "react";

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement>

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      className={`h-4 w-4 rounded border border-border text-primary focus:ring-primary ${className || ""}`}
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
