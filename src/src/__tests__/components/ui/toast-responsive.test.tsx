import type { ComponentType } from "react";
import { render } from "@testing-library/react";
import { ToastProvider, ToastViewport } from "@/components/ui/toast";

const ResponsiveToastViewport = ToastViewport as ComponentType<{ responsiveEnabled?: boolean }>;

it("anchors the enabled fixed toast viewport to the mobile viewport while preserving exact default classes", () => {
  const enabled = render(<ToastProvider><ResponsiveToastViewport responsiveEnabled /></ToastProvider>);
  expect(enabled.container.querySelector("ol")).toHaveAttribute(
    "class",
    "fixed left-0 top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:left-auto sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
  );
  enabled.unmount();

  const disabled = render(<ToastProvider><ResponsiveToastViewport /></ToastProvider>);
  expect(disabled.container.querySelector("ol")).toHaveAttribute(
    "class",
    "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
  );
});
