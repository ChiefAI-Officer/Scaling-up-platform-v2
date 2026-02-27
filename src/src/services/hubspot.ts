import https from "https";
import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/contacts";

const HUBSPOT_TIMEOUT_MS = 15_000;

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

// Backward-compatible export
const hubspotClient = new Proxy({} as Client, {
  get(_target, prop, receiver) {
    return Reflect.get(getHubSpotClient(), prop, receiver);
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
