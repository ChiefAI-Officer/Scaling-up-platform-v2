import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
// Import functions here as we create them
// import { workshopCreated } from "@/inngest/functions/workshop-created";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        // Add functions here
        // workshopCreated,
    ],
});
