import type {
  Workshop,
  WorkshopType,
  Coach,
  Registration,
  MarketingCampaign,
  AutomationTask,
  Survey,
} from "@prisma/client";

// Define status types as string literals (SQLite doesn't support enums)
export type WorkshopStatus =
  | "REQUESTED"
  | "VALIDATING"
  | "APPROVED"
  | "SETUP_IN_PROGRESS"
  | "MARKETING_ACTIVE"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "COMPLETED"
  | "CANCELLED";

export type WorkshopFormat = "IN_PERSON" | "VIRTUAL" | "HYBRID";

export type CertificationStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "REVOKED";

export type PaymentStatus = "PENDING" | "CURRENT" | "OVERDUE" | "SUSPENDED";

export type RegistrationStatus = "REGISTERED" | "CONFIRMED" | "CHECKED_IN" | "NO_SHOW" | "CANCELLED";

export type RegistrationPaymentStatus = "PENDING" | "COMPLETED" | "REFUNDED" | "FAILED" | "FREE";

export type CampaignType = "COACH_PROMO" | "SCALING_UP_EMAIL" | "SOCIAL_MEDIA" | "LANDING_PAGE";

export type CampaignStatus = "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "COMPLETED";

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export type SurveyType = "PRE_WORKSHOP" | "POST_WORKSHOP" | "NPS";

export type WorkshopCategory = "AI" | "EXIT_AND_VALUATION";

export type LandingPageTemplate = 
  | "BIO_PAGE" 
  | "SOLO_LANDING" 
  | "DUO_LANDING" 
  | "REGISTRATION" 
  | "THANK_YOU";

// Re-export Prisma types
export type {
  Workshop,
  WorkshopType,
  Coach,
  Registration,
  MarketingCampaign,
  AutomationTask,
  Survey,
};

// Extended types with relations
export type WorkshopWithRelations = Workshop & {
  coach: Coach;
  workshopType: WorkshopType;
  registrations?: Registration[];
  campaigns?: MarketingCampaign[];
  tasks?: AutomationTask[];
};

export type CoachWithRelations = Coach & {
  workshops?: Workshop[];
  certifications?: {
    id: string;
    workshopTypeId: string;
    certifiedAt: Date;
    expiresAt: Date | null;
    status: string;
    workshopType: WorkshopType;
  }[];
};

export type RegistrationWithWorkshop = Registration & {
  workshop: Workshop & {
    workshopType: WorkshopType;
    coach: Coach;
  };
};

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// Form input types
export interface CreateWorkshopInput {
  coachId: string;
  workshopTypeId: string;
  title: string;
  description?: string;
  format: WorkshopFormat;
  duration: string;
  eventDate: string;
  eventTime?: string;
  timezone?: string;
  venueName?: string;
  venueAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  parkingInstructions?: string;
  virtualPlatform?: string;
  virtualLink?: string;
  isFree?: boolean;
  priceCents?: number;
  earlyBirdPriceCents?: number;
  earlyBirdDeadline?: string;
  maxAttendees?: number;
}

export interface CreateRegistrationInput {
  workshopId: string;
  email: string;
  firstName: string;
  lastName: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
}

export interface CreateCoachInput {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  company?: string;
  bio?: string;
  hubspotId?: string;
  circleId?: string;
}

// Dashboard metrics
export interface DashboardMetrics {
  totalWorkshops: number;
  upcomingWorkshops: number;
  totalRegistrations: number;
  totalRevenue: number;
  workshopsByStatus: Record<string, number>;
  recentWorkshops: WorkshopWithRelations[];
}

// Pipeline stage for Kanban view
export interface PipelineStage {
  id: WorkshopStatus;
  label: string;
  workshops: WorkshopWithRelations[];
}
