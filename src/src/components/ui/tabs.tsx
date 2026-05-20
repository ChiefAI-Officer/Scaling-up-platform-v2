"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * Tabs primitive — restyled to match WF16/17/18 `.wf-tab` pattern:
 *   - flex row, gap-5, bottom border on the rail
 *   - active tab gets bottom-border-on-active (NOT pill background)
 *   - inactive tabs are muted-foreground, no background
 *   - disabled tabs are opacity 50, cursor-not-allowed
 *
 * This is intentionally NOT the shadcn-default pill styling. We override
 * the Radix defaults with Tailwind utility classes that map to the
 * design tokens used elsewhere in the codebase (`--primary`,
 * `--muted-foreground`, `--border`).
 */
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex items-center gap-5 border-b border-border overflow-x-auto",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // Base — matches WF16 `.wf-tab`
      "inline-flex items-center gap-1.5 whitespace-nowrap px-0.5 py-2.5",
      "text-sm font-medium text-muted-foreground",
      "border-b-2 border-transparent",
      "transition-colors hover:text-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      // Active — matches WF16 `.wf-tab.is-active`
      "data-[state=active]:text-primary data-[state=active]:font-semibold",
      "data-[state=active]:border-primary",
      // Disabled — matches WF16 `.wf-tab.is-disabled`
      "disabled:opacity-50 disabled:cursor-not-allowed",
      "data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
