"use client";

import { Component, type ReactNode } from "react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
}

export class RegistrationsErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        console.error("[RegistrationsPage] Client render error caught by boundary:", error);
        return { hasError: true };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
                    <p className="font-medium text-foreground mb-2">Unable to display registrations</p>
                    <p className="text-sm">Please refresh the page to try again.</p>
                    <button
                        onClick={() => this.setState({ hasError: false })}
                        className="mt-4 text-sm text-primary hover:underline"
                    >
                        Retry
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
