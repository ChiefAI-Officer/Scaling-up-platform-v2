/**
 * Shared template variable interpolation for landing page content.
 * Client-safe helpers (no db imports).
 */

/**
 * Interpolate {{variables}} in template content JSON string.
 * Replaces placeholders like {{workshop_title}}, {{coach_name}}, {{event_date}}, etc.
 */
export function interpolateContent(contentJson: string, variables: Record<string, string>): string {
    let result = contentJson;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), value);
    }
    return result;
}

/**
 * Returns true if the content string contains any {{...}} placeholders.
 */
export function templateHasPlaceholders(contentJson: string): boolean {
    return /\{\{[^}]+\}\}/.test(contentJson);
}

/**
 * Returns an array of placeholder names found in the content string (without the {{}} wrapping).
 */
export function findRemainingPlaceholders(contentJson: string): string[] {
    const matches = contentJson.match(/\{\{([^}]+)\}\}/g);
    return matches ? matches.map(m => m.replace(/[{}]/g, '').trim()) : [];
}

export function rewriteIdentityFields(
    contentJson: string,
    targetFields: Record<string, string>
): string {
    const content = JSON.parse(contentJson);
    for (const [key, value] of Object.entries(targetFields)) {
        if (key in content) {
            content[key] = value;
        }
    }
    return JSON.stringify(content);
}
