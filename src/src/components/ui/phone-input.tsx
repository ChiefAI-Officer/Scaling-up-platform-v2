"use client";

import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import type { E164Number } from "libphonenumber-js/core";

interface PhoneInputFieldProps {
    id?: string;
    value: string;
    onChange: (value: string) => void;
}

export function PhoneInputField({ id, value, onChange }: PhoneInputFieldProps) {
    return (
        <PhoneInput
            id={id}
            international
            defaultCountry="US"
            value={value as E164Number}
            onChange={(val?: E164Number) => onChange(val || "")}
            countrySelectProps={{ "aria-label": "Country" }}
            className="flex rounded-md border border-border bg-background text-sm shadow-sm focus-within:ring-1 focus-within:ring-primary"
        />
    );
}
