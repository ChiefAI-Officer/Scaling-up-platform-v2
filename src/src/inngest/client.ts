import { Inngest } from "inngest";
import { schemas } from "./types";

/**
 * Inngest Client
 * Entry point for all background job processing.
 * 
 * Event Key: scaling-up-platform
 */
export const inngest = new Inngest({
    id: "scaling-up-platform",
    schemas,
    eventKey: process.env.INNGEST_EVENT_KEY, // Optional in dev, required in prod associated with Inngest Cloud
});
