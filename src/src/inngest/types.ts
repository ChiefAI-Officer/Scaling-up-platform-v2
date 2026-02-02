import { EventSchemas } from "inngest";

// Define all event types here for type safety
type WorkshopCreated = {
    data: {
        workshopId: string;
        coachId: string;
        title: string;
        date: string;
    };
};

type RegistrationCreated = {
    data: {
        registrationId: string;
        workshopId: string;
        email: string;
        firstName: string;
    };
};

type ApprovalRequested = {
    data: {
        approvalId: string;
        type: string;
        coachId: string;
    };
};

type Events = {
    "workshop/created": WorkshopCreated;
    "registration/created": RegistrationCreated;
    "approval/requested": ApprovalRequested;
};

export const schemas = new EventSchemas().fromRecord<Events>();
