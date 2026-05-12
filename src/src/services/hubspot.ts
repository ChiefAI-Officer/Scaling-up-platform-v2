import https from "https";
import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";
import { getCachedLookup, setCachedLookup } from "./hubspot-lookup-cache";

const HUBSPOT_TIMEOUT_MS = 15_000;
const HUBSPOT_LOOKUP_ABORT_MS = 8_000;
const HUBSPOT_LOOKUP_CACHE_TTL_MS = 5 * 60_000;

function isHubSpotConfigured(): boolean {
  return !!process.env.HUBSPOT_ACCESS_TOKEN;
}

let _hubspotClient: Client | null = null;

function getHubSpotClient(): Client {
  if (!_hubspotClient) {
    if (!isHubSpotConfigured()) {
      console.warn("[HubSpot] HUBSPOT_ACCESS_TOKEN not set — HubSpot operations will be skipped.");
    }
    _hubspotClient = new Client({
      accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
      httpAgent: new https.Agent({ timeout: HUBSPOT_TIMEOUT_MS }),
    });
  }
  return _hubspotClient;
}

// Backward-compatible export.
//
// BUG-MAY11-2 fix: the previous Proxy passed `receiver` (the Proxy itself) to
// `Reflect.get`, so HubSpot Client getters that lazy-cached on `this` wrote
// their cache to the Proxy's empty target object — every chained read then
// returned undefined. Drop `receiver`, return raw values, and bind top-level
// functions back to the real client. Per-(client, prop) WeakMap cache keeps
// bound function identity stable across reads so callers that store or
// compare SDK method references keep working.
const _hubspotBoundCache = new WeakMap<Client, Map<string | symbol, unknown>>();

const hubspotClient = new Proxy({} as Client, {
  get(_target, prop) {
    const client = getHubSpotClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[
      prop as string | symbol
    ];
    if (typeof value !== "function") return value;
    let cache = _hubspotBoundCache.get(client);
    if (!cache) {
      cache = new Map();
      _hubspotBoundCache.set(client, cache);
    }
    let bound = cache.get(prop);
    if (!bound) {
      bound = (value as (...args: unknown[]) => unknown).bind(client);
      cache.set(prop, bound);
    }
    return bound;
  },
});

interface ContactProperties {
  email: string;
  firstname: string;
  lastname: string;
  company?: string;
  jobtitle?: string;
  phone?: string;
}

interface WorkshopContactProperties extends ContactProperties {
  workshop_name?: string;
  workshop_date?: string;
  coach_name?: string;
}

export async function createOrUpdateContact(
  properties: WorkshopContactProperties
): Promise<string> {
  if (!isHubSpotConfigured()) {
    console.warn("[HubSpot] Skipping createOrUpdateContact — token not configured.");
    return "hubspot-not-configured";
  }
  try {
    // Try to find existing contact
    const searchResponse = await hubspotClient.crm.contacts.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "email",
              operator: FilterOperatorEnum.Eq,
              value: properties.email,
            },
          ],
        },
      ],
      properties: ["email", "firstname", "lastname"],
      limit: 1,
    });

    if (searchResponse.results.length > 0) {
      // Update existing contact
      const contactId = searchResponse.results[0].id;
      await hubspotClient.crm.contacts.basicApi.update(contactId, {
        properties: properties as unknown as Record<string, string>,
      });
      return contactId;
    } else {
      // Create new contact
      const createResponse = await hubspotClient.crm.contacts.basicApi.create({
        properties: properties as unknown as Record<string, string>,
      });
      return createResponse.id;
    }
  } catch (error) {
    console.error("HubSpot contact creation/update error:", error);
    throw error;
  }
}

export async function addContactToList(
  contactId: string,
  listId: string
): Promise<void> {
  if (!isHubSpotConfigured()) {
    console.warn("[HubSpot] Skipping addContactToList — token not configured.");
    return;
  }
  try {
    // HubSpot API v4 list membership
    await hubspotClient.crm.lists.membershipsApi.add(listId, [contactId]);
  } catch (error) {
    console.error("HubSpot list membership error:", error);
    throw error;
  }
}

export async function getContactByEmail(email: string): Promise<unknown | null> {
  if (!isHubSpotConfigured()) {
    console.warn("[HubSpot] Skipping getContactByEmail — token not configured.");
    return null;
  }
  try {
    const searchResponse = await hubspotClient.crm.contacts.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "email",
              operator: FilterOperatorEnum.Eq,
              value: email,
            },
          ],
        },
      ],
      properties: [
        "email",
        "firstname",
        "lastname",
        "company",
        "phone",
        "jobtitle",
      ],
      limit: 1,
    });

    return searchResponse.results[0] || null;
  } catch (error) {
    console.error("HubSpot contact search error:", error);
    throw error;
  }
}

export async function syncCoachFromHubspot(hubspotId: string): Promise<{
  email: string | null | undefined;
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  company: string | null | undefined;
  phone: string | null | undefined;
  certificationStatus: string | null | undefined;
  paymentStatus: string | null | undefined;
  territory: string | null | undefined;
}> {
  if (!isHubSpotConfigured()) {
    console.warn("[HubSpot] Skipping syncCoachFromHubspot — token not configured.");
    return {
      email: null, firstName: null, lastName: null, company: null,
      phone: null, certificationStatus: null, paymentStatus: null, territory: null,
    };
  }
  try {
    const contact = await hubspotClient.crm.contacts.basicApi.getById(
      hubspotId,
      [
        "email",
        "firstname",
        "lastname",
        "company",
        "phone",
        "coach_certification_status",
        "coach_payment_status",
        "coach_territory",
      ]
    );

    return {
      email: contact.properties.email,
      firstName: contact.properties.firstname,
      lastName: contact.properties.lastname,
      company: contact.properties.company,
      phone: contact.properties.phone,
      certificationStatus: contact.properties.coach_certification_status,
      paymentStatus: contact.properties.coach_payment_status,
      territory: contact.properties.coach_territory,
    };
  } catch (error) {
    console.error("HubSpot coach sync error:", error);
    throw error;
  }
}

export async function updateCoachInHubspot(
  hubspotId: string,
  properties: Record<string, string>
): Promise<void> {
  if (!isHubSpotConfigured()) {
    console.warn("[HubSpot] Skipping updateCoachInHubspot — token not configured.");
    return;
  }
  try {
    await hubspotClient.crm.contacts.basicApi.update(hubspotId, {
      properties,
    });
  } catch (error) {
    console.error("HubSpot coach update error:", error);
    throw error;
  }
}

export { hubspotClient };

// ============================================
// V2: Campaign Scheduling & Batch Operations
// ============================================

export interface EmailSequenceItem {
  templateId: string; // HubSpot Template ID
  sendAt: Date;
  subject: string;
}

export interface ContactUpdate {
  email: string;
  properties: Record<string, string>;
}

/**
 * Schedule a 5-email sequence for a workshop
 * Note: HubSpot transactional email scheduling via API usually wraps the Single Send API.
 * For true "scheduling", we either use HubSpot Workflows (if Enterprise) or
 * the Scaling Up Platform's Inngest queue to trigger Single Sends at the right time.
 * 
 * DESIGN DECISION: We will use Inngest to schedule the triggers, 
 * and this function effectively just validates or prepares the contact/list.
 * 
 * However, if using HubSpot Marketing Email API, we might create a formatted "campaign".
 */
export async function scheduleEmailCampaign(
  contactEmail: string,
  sequence: EmailSequenceItem[]
): Promise<void> {
  if (!isHubSpotConfigured()) {
    console.warn("[HubSpot] Skipping scheduleEmailCampaign — token not configured.");
    return;
  }
  // Check if contact exists
  const contact = await getContactByEmail(contactEmail);
  if (!contact) {
    throw new Error(`Contact ${contactEmail} not found in HubSpot`);
  }

  // In V2 Architecture, Inngest handles the timing.
  // This function might be used to set contact properties that trigger a HubSpot Workflow
  // OR just logged as a placeholder for the URL-based single-send implementation.
  console.log(`[HubSpot Service] Scheduled sequence for ${contactEmail}:`, sequence);

  // Example: tagging contact with "registered_for_workshop" which might trigger a workflow
  // await updateCoachInHubspot(contact.id, { workshop_status: "registered" });
}

/**
 * Batch update contacts (e.g., after a workshop to tag all attendees)
 */
export async function batchUpdateContacts(updates: ContactUpdate[]): Promise<void> {
  if (!isHubSpotConfigured()) {
    console.warn("[HubSpot] Skipping batchUpdateContacts — token not configured.");
    return;
  }
  try {
    const inputs = updates.map(u => ({
      email: u.email,
      properties: u.properties
    }));

    // Start a batch via CRM API
    // Note: HubSpot API client batch update usually requires IDs. 
    // If we only have emails, we might need to search first or use the createOrUpdate batch endpoint.
    // Ideally we use CreateOrUpdate batch 
    await hubspotClient.crm.contacts.batchApi.create(
      { inputs: inputs as { email: string; properties: Record<string, string> }[] }
    );
  } catch (error) {
    console.error("HubSpot batch update error:", error);
    throw error;
  }
}

/**
 * Typed Coach Getter (simulates Service-Domain mapping)
 */
export async function getCoachByEmail(email: string): Promise<unknown | null> {
  if (!isHubSpotConfigured()) {
    console.warn("[HubSpot] Skipping getCoachByEmail — token not configured.");
    return null;
  }
  return getContactByEmail(email);
}

// ---------------------------------------------------------------------------
// Q-MAY6-2: HubSpot side card on admin coach detail
// ---------------------------------------------------------------------------
//
// Operator runbook: opening an admin coach detail page calls
// `lookupHubSpotContact(coach.email)` to render the HubSpot side card showing
// lifecycle stage + last modified + "View in HubSpot" link.
//
// Discriminated result (Round 2 M5): callers get { kind: "unconfigured" |
// "not_found" | "error" | "found" } so the UI renders distinct states. Null-
// collapsing auth errors to "Not found" would hide real failures.
//
// Property request is intentionally minimal — `lifecyclestage` and
// `lastmodifieddate` are HubSpot stock properties on every account. We do
// NOT request `hs_lead_status` because some accounts strip optional defaults
// and a single PROPERTY_DOESNT_EXIST validation error fails the whole search.
//
// Error log payload sanitized: status + category only. No email, body, or
// headers. Side card renders a generic error state.

export interface HubSpotSideCardContact {
  id: string;
  properties: {
    email?: string;
    firstname?: string;
    lastname?: string;
    lifecyclestage?: string;
    lastmodifieddate?: string;
  };
}

export type HubSpotLookupResult =
  | { kind: "unconfigured" }
  | { kind: "not_found" }
  | {
      kind: "error";
      status: number;
      category?: string;
      reason?: "timeout" | "sdk" | "unknown";
    }
  | { kind: "found"; contact: HubSpotSideCardContact };

export async function lookupHubSpotContact(
  email: string,
): Promise<HubSpotLookupResult> {
  // Runtime kill switch — operator flips HUBSPOT_SIDE_CARD_ENABLED="false" +
  // redeploys to disable the side card without code changes (Wave 8-A rollback).
  if (process.env.HUBSPOT_SIDE_CARD_ENABLED === "false") {
    return { kind: "unconfigured" };
  }
  if (!isHubSpotConfigured()) {
    return { kind: "unconfigured" };
  }

  const cached = getCachedLookup(email);
  if (cached) {
    console.info(
      `[hubspot.lookup] kind=${cached.kind} durationMs=0 cacheHit=true`,
    );
    return cached;
  }

  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    HUBSPOT_LOOKUP_ABORT_MS,
  );

  try {
    const searchResponse = await hubspotClient.crm.contacts.searchApi.doSearch(
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "email",
                operator: FilterOperatorEnum.Eq,
                value: email,
              },
            ],
          },
        ],
        properties: [
          "email",
          "firstname",
          "lastname",
          "lifecyclestage",
          "lastmodifieddate",
        ],
        limit: 1,
      },
      // HubSpot SDK forwards request options to its underlying HTTP client;
      // `signal` lets us abort on timeout. Typed as never because the SDK's
      // public signature does not yet expose the options arg.
      { signal: controller.signal } as unknown as never,
    );

    const durationMs = Date.now() - start;
    const first = searchResponse.results?.[0];
    if (!first) {
      const result: HubSpotLookupResult = { kind: "not_found" };
      setCachedLookup(email, result, Date.now() + HUBSPOT_LOOKUP_CACHE_TTL_MS);
      console.info(
        `[hubspot.lookup] kind=not_found durationMs=${durationMs} cacheHit=false`,
      );
      return result;
    }
    const result: HubSpotLookupResult = {
      kind: "found",
      contact: {
        id: first.id,
        properties: (first.properties ??
          {}) as HubSpotSideCardContact["properties"],
      },
    };
    setCachedLookup(email, result, Date.now() + HUBSPOT_LOOKUP_CACHE_TTL_MS);
    console.info(
      `[hubspot.lookup] kind=found durationMs=${durationMs} cacheHit=false`,
    );
    return result;
  } catch (error: unknown) {
    const durationMs = Date.now() - start;
    const e = error as {
      code?: number | string;
      status?: number;
      name?: string;
      body?: { category?: string };
    };
    const isAbort =
      e?.name === "AbortError" ||
      e?.code === "ABORT_ERR" ||
      e?.code === "ERR_CANCELED";
    if (isAbort) {
      console.error(
        `[hubspot.lookup] kind=error reason=timeout status=0 durationMs=${durationMs} cacheHit=false`,
      );
      return { kind: "error", status: 0, reason: "timeout" };
    }
    const status =
      typeof e?.code === "number"
        ? e.code
        : typeof e?.status === "number"
          ? e.status
          : 0;
    const category = e?.body?.category;
    const reason: "sdk" | "unknown" = status === 0 ? "sdk" : "unknown";
    // Sanitized: never log the searched email, raw body, or headers.
    console.error(
      `[hubspot.lookup] kind=error status=${status} reason=${reason} durationMs=${durationMs} cacheHit=false`,
    );
    return { kind: "error", status, category, reason };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getHubSpotPortalId(): string | null {
  const raw = process.env.HUBSPOT_PORTAL_ID;
  if (!raw || raw.trim().length === 0) return null;
  return raw.trim();
}

/**
 * Fetch the `coach_contract_status` custom property for a contact by HubSpot contact ID.
 *
 * Returns the raw string value (e.g. "Certified Coach", "Pending") or null when the
 * property is absent/empty.  Throws on HTTP error so the caller can fail-closed.
 *
 * Used by the Wave 8-D HubSpot auto-approval path in approval-engine.ts.
 */
export async function getHubSpotCoachContractStatus(
  hubspotContactId: string,
): Promise<string | null> {
  if (!isHubSpotConfigured()) {
    return null;
  }
  // Throws on any API error — caller must catch and fail-closed.
  const contact = await hubspotClient.crm.contacts.basicApi.getById(
    hubspotContactId,
    ["coach_contract_status"],
  );
  return contact.properties?.coach_contract_status ?? null;
}
