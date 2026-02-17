import { NextResponse } from "next/server";

/**
 * API Documentation endpoint
 * Returns OpenAPI-style documentation for all API endpoints
 */
export async function GET() {
  const apiDocs = {
    openapi: "3.0.0",
    info: {
      title: "Scaling Up Workshop Platform API",
      version: "1.0.0",
      description: "API documentation for the Scaling Up Workshop Management Platform",
      contact: {
        name: "API Support",
        email: "support@scalingup.com",
      },
    },
    servers: [
      {
        url: process.env.APP_URL || "http://localhost:3000",
        description: "Current environment",
      },
    ],
    paths: {
      "/api/workshops": {
        get: {
          summary: "List all workshops",
          tags: ["Workshops"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "page",
              in: "query",
              schema: { type: "integer", default: 1 },
              description: "Page number for pagination",
            },
            {
              name: "pageSize",
              in: "query",
              schema: { type: "integer", default: 10 },
              description: "Number of items per page",
            },
            {
              name: "status",
              in: "query",
              schema: { type: "string" },
              description: "Filter by workshop status",
            },
            {
              name: "search",
              in: "query",
              schema: { type: "string" },
              description: "Search workshops by title",
            },
          ],
          responses: {
            "200": {
              description: "List of workshops",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/WorkshopListResponse",
                  },
                },
              },
            },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Create a new workshop",
          tags: ["Workshops"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateWorkshopInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Workshop created successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/WorkshopResponse" },
                },
              },
            },
            "400": { description: "Validation error" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/workshops/{id}": {
        get: {
          summary: "Get workshop by ID",
          tags: ["Workshops"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Workshop ID",
            },
          ],
          responses: {
            "200": {
              description: "Workshop details",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/WorkshopResponse" },
                },
              },
            },
            "404": { description: "Workshop not found" },
          },
        },
        patch: {
          summary: "Update workshop",
          tags: ["Workshops"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateWorkshopInput" },
              },
            },
          },
          responses: {
            "200": { description: "Workshop updated" },
            "400": { description: "Validation error" },
            "404": { description: "Workshop not found" },
          },
        },
        delete: {
          summary: "Cancel workshop (soft delete)",
          tags: ["Workshops"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Workshop cancelled" },
            "404": { description: "Workshop not found" },
          },
        },
      },
      "/api/workshops/{id}/status": {
        patch: {
          summary: "Update workshop status",
          tags: ["Workshops"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: {
                      type: "string",
                      enum: [
                        "REQUESTED",
                        "AWAITING_APPROVAL",
                        "PRE_EVENT",
                        "POST_EVENT",
                        "COMPLETED",
                        "CANCELED",
                      ],
                    },
                  },
                  required: ["status"],
                },
              },
            },
          },
          responses: {
            "200": { description: "Status updated" },
            "400": { description: "Invalid status transition" },
            "404": { description: "Workshop not found" },
          },
        },
      },
      "/api/coaches": {
        get: {
          summary: "List all coaches",
          tags: ["Coaches"],
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "List of coaches",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CoachListResponse" },
                },
              },
            },
          },
        },
        post: {
          summary: "Create a new coach",
          tags: ["Coaches"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateCoachInput" },
              },
            },
          },
          responses: {
            "201": { description: "Coach created" },
            "400": { description: "Validation error" },
          },
        },
      },
      "/api/registrations": {
        post: {
          summary: "Create a new registration",
          tags: ["Registrations"],
          description: "Public endpoint - no authentication required",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateRegistrationInput" },
              },
            },
          },
          responses: {
            "201": { description: "Registration created" },
            "400": { description: "Validation error" },
            "404": { description: "Workshop not found" },
          },
        },
      },
      "/api/webhooks/stripe": {
        post: {
          summary: "Stripe webhook handler",
          tags: ["Webhooks"],
          description: "Handles Stripe payment events",
          responses: {
            "200": { description: "Webhook processed" },
            "400": { description: "Invalid webhook signature" },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Workshop: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string", nullable: true },
            format: { type: "string", enum: ["IN_PERSON", "VIRTUAL", "HYBRID"] },
            duration: { type: "string" },
            eventDate: { type: "string", format: "date-time" },
            eventTime: { type: "string", nullable: true },
            status: { type: "string" },
            venueName: { type: "string", nullable: true },
            venueAddress: { type: "string", nullable: true },
            virtualPlatform: { type: "string", nullable: true },
            virtualLink: { type: "string", nullable: true },
            isFree: { type: "boolean" },
            priceCents: { type: "integer", nullable: true },
            maxAttendees: { type: "integer" },
            landingPageSlug: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        CreateWorkshopInput: {
          type: "object",
          required: ["coachId", "workshopTypeId", "title", "format", "duration", "eventDate"],
          properties: {
            coachId: { type: "string" },
            workshopTypeId: { type: "string" },
            title: { type: "string", minLength: 1 },
            description: { type: "string" },
            format: { type: "string", enum: ["IN_PERSON", "VIRTUAL", "HYBRID"] },
            duration: { type: "string" },
            eventDate: { type: "string", format: "date" },
            eventTime: { type: "string" },
            timezone: { type: "string" },
            venueName: { type: "string" },
            venueAddress: {
              type: "object",
              properties: {
                street: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                zip: { type: "string" },
                country: { type: "string" },
              },
            },
            parkingInstructions: { type: "string" },
            virtualPlatform: { type: "string" },
            virtualLink: { type: "string", format: "uri" },
            isFree: { type: "boolean" },
            priceCents: { type: "integer", minimum: 0 },
            earlyBirdPriceCents: { type: "integer", minimum: 0 },
            earlyBirdDeadline: { type: "string", format: "date" },
            maxAttendees: { type: "integer", minimum: 1 },
          },
        },
        UpdateWorkshopInput: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            format: { type: "string", enum: ["IN_PERSON", "VIRTUAL", "HYBRID"] },
            duration: { type: "string" },
            eventDate: { type: "string", format: "date" },
            eventTime: { type: "string" },
            venueName: { type: "string" },
            venueAddress: { type: "object" },
            virtualLink: { type: "string" },
            isFree: { type: "boolean" },
            priceCents: { type: "integer" },
            maxAttendees: { type: "integer" },
          },
        },
        CreateCoachInput: {
          type: "object",
          required: ["email", "firstName", "lastName"],
          properties: {
            email: { type: "string", format: "email" },
            firstName: { type: "string", minLength: 1 },
            lastName: { type: "string", minLength: 1 },
            phone: { type: "string" },
            company: { type: "string" },
            bio: { type: "string" },
          },
        },
        CreateRegistrationInput: {
          type: "object",
          required: ["workshopId", "email", "firstName", "lastName"],
          properties: {
            workshopId: { type: "string" },
            email: { type: "string", format: "email" },
            firstName: { type: "string", minLength: 1 },
            lastName: { type: "string", minLength: 1 },
            company: { type: "string" },
            jobTitle: { type: "string" },
            phone: { type: "string" },
          },
        },
        WorkshopResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            data: { $ref: "#/components/schemas/Workshop" },
          },
        },
        WorkshopListResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/Workshop" },
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" },
              },
            },
          },
        },
        CoachListResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            data: { type: "array", items: { type: "object" } },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                statusCode: { type: "integer" },
                details: { type: "object" },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: "Workshops", description: "Workshop management endpoints" },
      { name: "Coaches", description: "Coach management endpoints" },
      { name: "Registrations", description: "Registration endpoints (public)" },
      { name: "Webhooks", description: "External service webhooks" },
    ],
  };

  return NextResponse.json(apiDocs);
}
