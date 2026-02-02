/**
 * Typeform Survey Integration
 * Handles embedding and linking to Typeform surveys for workshop feedback.
 */

interface TypeformConfig {
    formId: string;
    hiddenFields?: Record<string, string>;
}

/**
 * Generate a Typeform survey URL with hidden fields for tracking
 */
export function generateSurveyUrl(
    workshopId: string,
    registrationId: string,
    email: string
): string {
    const baseUrl = process.env.TYPEFORM_BASE_URL || "https://form.typeform.com/to";
    const formId = process.env.TYPEFORM_FEEDBACK_FORM_ID || "default-form-id";

    // Hidden fields for tracking responses back to registrations
    const hiddenFields = new URLSearchParams({
        workshop_id: workshopId,
        registration_id: registrationId,
        email: email,
    });

    return `${baseUrl}/${formId}#${hiddenFields.toString()}`;
}

/**
 * Generate embed code for Typeform survey in landing page or portal
 */
export function generateEmbedCode(config: TypeformConfig): string {
    // Return Typeform's embed widget HTML
    return `
    <div data-tf-live="${config.formId}"${config.hiddenFields ? ` data-tf-hidden="${new URLSearchParams(config.hiddenFields).toString()}"` : ""}></div>
    <script src="//embed.typeform.com/next/embed.js"></script>
  `;
}

/**
 * Generate an iframe embed for simpler integration
 */
export function generateIframeEmbed(
    formId: string,
    hiddenFields?: Record<string, string>
): string {
    let url = `https://form.typeform.com/to/${formId}`;

    if (hiddenFields) {
        const params = new URLSearchParams(hiddenFields);
        url += `#${params.toString()}`;
    }

    return `
    <iframe
      src="${url}"
      width="100%"
      height="500"
      frameborder="0"
      marginheight="0"
      marginwidth="0"
      title="Workshop Feedback Survey"
    ></iframe>
  `;
}

/**
 * Create a survey configuration for a specific workshop
 */
export function createWorkshopSurveyConfig(
    workshopId: string,
    coachId: string,
    workshopTitle: string
): TypeformConfig {
    return {
        formId: process.env.TYPEFORM_FEEDBACK_FORM_ID || "workshop-feedback",
        hiddenFields: {
            workshop_id: workshopId,
            coach_id: coachId,
            workshop_title: workshopTitle,
        }
    };
}

const typeform = {
    generateSurveyUrl,
    generateEmbedCode,
    generateIframeEmbed,
    createWorkshopSurveyConfig,
};

export default typeform;
