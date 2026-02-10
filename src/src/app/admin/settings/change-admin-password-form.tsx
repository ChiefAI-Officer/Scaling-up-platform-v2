"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PasswordFormData = {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
};

const initialForm: PasswordFormData = {
  currentPassword: "",
  newPassword: "",
  confirmNewPassword: "",
};

export default function ChangeAdminPasswordForm() {
  const [formData, setFormData] = useState<PasswordFormData>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleChange =
    (field: keyof PasswordFormData) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((previous) => ({
        ...previous,
        [field]: event.target.value,
      }));
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string | Array<{ message?: string }>;
        message?: string;
      };

      if (!response.ok || !payload.success) {
        if (typeof payload.error === "string") {
          throw new Error(payload.error);
        }

        if (Array.isArray(payload.error) && payload.error[0]?.message) {
          throw new Error(payload.error[0].message);
        }

        throw new Error("Failed to update password");
      }

      setSuccessMessage(payload.message || "Password updated successfully.");
      setFormData(initialForm);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMessage}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="currentPassword">Current Password</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          value={formData.currentPassword}
          onChange={handleChange("currentPassword")}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword">New Password</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          value={formData.newPassword}
          onChange={handleChange("newPassword")}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
        <Input
          id="confirmNewPassword"
          type="password"
          autoComplete="new-password"
          value={formData.confirmNewPassword}
          onChange={handleChange("confirmNewPassword")}
          required
        />
      </div>

      <p className="text-xs text-gray-600">
        Password must be at least 12 characters and include upper/lowercase letters,
        a number, and a special character.
      </p>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Updating..." : "Update password"}
        </Button>
      </div>
    </form>
  );
}
