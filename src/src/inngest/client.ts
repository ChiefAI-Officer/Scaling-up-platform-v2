import { Inngest } from "inngest";
import { schemas } from "./types";

if (!process.env.INNGEST_EVENT_KEY) {
    console.warn(
        "[Inngest] INNGEST_EVENT_KEY is not set. Background jobs (email sequences, stale approval checks, workflows) will not execute. " +
        "Set INNGEST_EVENT_KEY in your environment variables to enable Inngest."
    );
}

if (!process.env.INNGEST_SIGNING_KEY) {
    console.warn(
        "[Inngest] INNGEST_SIGNING_KEY is not set. Inngest Cloud will not be able to verify this app's webhook endpoint."
    );
}

/**
 * Inngest Client
 * Entry point for all background job processing.
 *
 * Event Key: scaling-up-platform
 */
export const inngest = new Inngest({
    id: "scaling-up-platform",
    schemas,
    eventKey: process.env.INNGEST_EVENT_KEY,
});
