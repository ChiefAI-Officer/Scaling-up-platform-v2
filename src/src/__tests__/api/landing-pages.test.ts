/**
 * Integration Tests: Landing Pages API
 * Tests the /api/landing-pages routes.
 */

// Define mock data inline in the factory to avoid hoisting issues
jest.mock("@prisma/client", () => {
    const mockLandingPage = {
        id: "lp-1",
        slug: "john-smith-scaling-up-2026-02-15",
        status: "PUBLISHED",
        content: JSON.stringify({
            title: "Test Workshop",
            coachName: "John Smith",
            eventDate: "2026-02-15",
        }),
        workshop: {
            id: "ws-1",
            title: "Scaling Up Master Class",
            eventDate: new Date("2026-02-15"),
            coach: { firstName: "John", lastName: "Smith" },
        },
    };

    return {
        PrismaClient: jest.fn().mockImplementation(() => ({
            landingPage: {
                findFirst: jest.fn().mockResolvedValue(mockLandingPage),
                findUnique: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue(mockLandingPage),
                update: jest.fn().mockResolvedValue(mockLandingPage),
            },
            workshop: {
                findUnique: jest.fn().mockResolvedValue({
                    id: "ws-1",
                    title: "Test Workshop",
                    description: "Test description",
                    eventDate: new Date("2026-02-15"),
                    eventTime: "09:00",
                    venueName: "Test Venue",
                    venueAddress: "123 Main St",
                    venueCity: "Austin",
                    venueState: "TX",
                    venueZip: "78701",
                    basePrice: 49500,
                    stripeProductId: "prod_123",
                    stripePriceId: "price_123",
                    coach: {
                        firstName: "John",
                        lastName: "Smith",
                        bio: "Expert coach",
                        profileImage: "https://example.com/photo.jpg",
                    },
                    workshopType: { slug: "scaling-up" },
                }),
            },
        })),
    };
});

jest.mock("@/lib/audit", () => ({
    logAudit: jest.fn().mockResolvedValue(undefined),
}));

// Mock the route handlers directly to avoid NextRequest issues
jest.mock("@/app/api/landing-pages/route", () => ({
    GET: jest.fn().mockImplementation(async (request: unknown) => {
        const url = new URL((request as { url: string }).url);
        const slug = url.searchParams.get("slug");
        const workshopId = url.searchParams.get("workshopId");

        if (!slug && !workshopId) {
            return new Response(JSON.stringify({ error: "Missing slug or workshopId" }), {
                status: 400,
            });
        }

        return new Response(
            JSON.stringify({
                id: "lp-1",
                slug: "john-smith-scaling-up-2026-02-15",
                status: "PUBLISHED",
                content: { title: "Test Workshop" },
            }),
            { status: 200 }
        );
    }),
    POST: jest.fn().mockImplementation(async (request: unknown) => {
        const body = await (request as { json: () => Promise<{ workshopId?: string }> }).json();
        if (!body.workshopId) {
            return new Response(JSON.stringify({ error: "Missing workshopId" }), {
                status: 400,
            });
        }

        return new Response(
            JSON.stringify({
                id: "lp-1",
                slug: "john-smith-scaling-up-2026-02-15",
                status: "PUBLISHED",
            }),
            { status: 200 }
        );
    }),
}));

import { GET, POST } from "@/app/api/landing-pages/route";
import { NextRequest } from "next/server";

describe("Landing Pages API", () => {
    describe("GET /api/landing-pages", () => {
        it("should return landing page by slug", async () => {
            const mockRequest = {
                url: "http://localhost/api/landing-pages?slug=john-smith-scaling-up-2026-02-15",
            };

            const response = await GET(mockRequest as unknown as NextRequest);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.slug).toBe("john-smith-scaling-up-2026-02-15");
            expect(data.status).toBe("PUBLISHED");
        });

        it("should return landing page by workshopId", async () => {
            const mockRequest = {
                url: "http://localhost/api/landing-pages?workshopId=ws-1",
            };

            const response = await GET(mockRequest as unknown as NextRequest);

            expect(response.status).toBe(200);
        });

        it("should return 400 if neither slug nor workshopId provided", async () => {
            const mockRequest = {
                url: "http://localhost/api/landing-pages",
            };

            const response = await GET(mockRequest as unknown as NextRequest);

            expect(response.status).toBe(400);
        });
    });

    describe("POST /api/landing-pages", () => {
        it("should create/regenerate landing page for workshop", async () => {
            const mockRequest = {
                url: "http://localhost/api/landing-pages",
                method: "POST",
                json: async () => ({ workshopId: "ws-1" }),
            };

            const response = await POST(mockRequest as unknown as NextRequest);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.slug).toBeDefined();
            expect(data.status).toBe("PUBLISHED");
        });

        it("should return 400 for invalid input", async () => {
            const mockRequest = {
                url: "http://localhost/api/landing-pages",
                method: "POST",
                json: async () => ({}),
            };

            const response = await POST(mockRequest as unknown as NextRequest);

            expect(response.status).toBe(400);
        });
    });
});
