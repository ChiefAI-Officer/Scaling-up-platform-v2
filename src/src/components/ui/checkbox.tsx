"use client";

import * as React from "react";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      className={`h-4 w-4 rounded border border-gray-300 text-blue-600 focus:ring-blue-500 ${className || ""}`}
      {...props}
    />
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
