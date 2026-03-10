"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RegistrationFormProps {
  workshopId: string;
  isFree: boolean;
}

export function RegistrationForm({ workshopId, isFree }: RegistrationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    jobTitle: "",
    phone: "",
    discountCode: "",
    marketingOptIn: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Create registration
      const registrationResponse = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workshopId,
          ...formData,
        }),
      });

      if (!registrationResponse.ok) {
        const contentType = registrationResponse.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error(`Registration failed (${registrationResponse.status})`);
        }
      }

      const registrationData = await registrationResponse.json();

      if (!registrationData.success) {
        const errorMsg = Array.isArray(registrationData.error)
          ? registrationData.error.map((e: { message?: string }) => e.message).join(", ")
          : registrationData.error || "Registration failed";
        throw new Error(errorMsg);
      }

      if (isFree) {
        // For free workshops, redirect to success page
        router.push(`/registration/success?id=${registrationData.data.id}`);
      } else {
        // For paid workshops, create checkout session
        const checkoutResponse = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registrationId: registrationData.data.id,
            discountCode: formData.discountCode.trim() || undefined,
          }),
        });

        if (!checkoutResponse.ok) {
          const contentType = checkoutResponse.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) {
            throw new Error(`Checkout failed (${checkoutResponse.status})`);
          }
        }

        const checkoutData = await checkoutResponse.json();

        if (!checkoutData.success) {
          throw new Error(checkoutData.error || "Failed to create checkout");
        }

        // Redirect to Stripe Checkout
        window.location.href = checkoutData.data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            required
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            id="lastName"
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
            required
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="email">Email *</Label>
        <Input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          required
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="company">Company *</Label>
        <Input
          id="company"
          name="company"
          value={formData.company}
          onChange={handleChange}
          required
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="phone">Phone *</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          value={formData.phone}
          onChange={handleChange}
          required
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="jobTitle">Job Title</Label>
        <Input
          id="jobTitle"
          name="jobTitle"
          value={formData.jobTitle}
          onChange={handleChange}
          className="mt-1"
        />
      </div>

      {!isFree && (
        <div>
          <Label htmlFor="discountCode">Discount Code (optional)</Label>
          <Input
            id="discountCode"
            name="discountCode"
            value={formData.discountCode}
            onChange={handleChange}
            className="mt-1"
          />
        </div>
      )}

      <div className="flex items-start gap-2">
        <input
          id="marketingOptIn"
          name="marketingOptIn"
          type="checkbox"
          checked={formData.marketingOptIn}
          onChange={handleChange}
          className="mt-1 h-4 w-4 rounded border-border"
        />
        <Label htmlFor="marketingOptIn" className="text-sm text-muted-foreground font-normal leading-snug">
          I&apos;d like to receive future Scaling Up events and insights
        </Label>
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading ? (
          "Processing..."
        ) : isFree ? (
          "Register Now"
        ) : (
          "Continue to Payment"
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        By registering, you agree to receive communications about this workshop.
      </p>
    </form>
  );
}
