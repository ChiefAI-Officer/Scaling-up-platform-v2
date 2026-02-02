import "@testing-library/jest-dom";

declare global {
    namespace jest {
        interface Matchers<R> {
            toBeInTheDocument(): R;
            toBeVisible(): R;
            toBeDisabled(): R;
            toBeEnabled(): R;
            toHaveClass(className: string): R;
            toHaveTextContent(text: string | RegExp): R;
            toHaveValue(value: string | number | string[]): R;
            toHaveAttribute(attr: string, value?: string): R;
            toHaveStyle(css: Record<string, unknown>): R;
            toContainElement(element: HTMLElement | null): R;
            toHaveAccessibleDescription(description?: string | RegExp): R;
            toHaveAccessibleName(name?: string | RegExp): R;
            toHaveFocus(): R;
            toBeChecked(): R;
            toBePartiallyChecked(): R;
            toBeEmpty(): R;
            toBeEmptyDOMElement(): R;
            toBeInvalid(): R;
            toBeRequired(): R;
            toBeValid(): R;
            toContainHTML(html: string): R;
            toHaveDisplayValue(value: string | RegExp | (string | RegExp)[]): R;
            toHaveFormValues(values: Record<string, unknown>): R;
        }
    }
}
