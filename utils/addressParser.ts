export interface ParsedAddress {
    street?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zip_code?: string;
}

export interface ParsedPhone {
    primary: string;
    secondary?: string;
}

/**
 * Extracts phones separated by a slash `/` and normalizes them.
 * Assumes the input could be e.g. '12997080894 / 12997080000'
 */
export function parsePhones(rawPhoneStr: string): ParsedPhone {
    if (!rawPhoneStr) return { primary: '' };

    const parts = rawPhoneStr.split('/');
    const cleanedParts = parts.map(p => {
        let cleaned = p.replace(/\D/g, ''); // Remove non-digits

        // Some phones might start with 0 (e.g., 012997080894), remove leading zero if length is 12 (0 + DD + 9 digits) or 11 (0 + DD + 8 digits)
        if (cleaned.startsWith('0') && cleaned.length > 10) {
            cleaned = cleaned.substring(1);
        }

        return cleaned;
    }).filter(p => p.length >= 10); // Minimum 10 digits for a valid Brazilian phone with DDD

    return {
        primary: cleanedParts[0] || '',
        secondary: cleanedParts[1] || undefined // Store second phone if found
    };
}

/**
 * Parses free-form Brazilian addresses using heuristics.
 * Example: Doze, nº 08 - Verde Mar, CEP:11677262, CARAGUATATUBA - SP
 */
export function parseAddress(rawAddressStr: string): ParsedAddress {
    if (!rawAddressStr) return {};

    let text = rawAddressStr.trim();
    const parsed: ParsedAddress = {};

    // 1. Extract ZIP Code (CEP): '\d{5}-?\d{3}'
    const zipMatch = text.match(/\b\d{5}-?\d{3}\b/);
    if (zipMatch) {
        parsed.zip_code = zipMatch[0].replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2'); // Format as XXXXX-XXX
        // Remove CEP from text to simplify remaining parsing
        text = text.replace(/CEP\s*:?\s*\b\d{5}-?\d{3}\b/gi, '').replace(/\b\d{5}-?\d{3}\b/, '');
    }

    // 2. Extract State (UF): two capital letters usually at the end or preceded by '-'
    const stateMatch = text.match(/\b-\s*([A-Z]{2})\b|\b([A-Z]{2})\b$/i);
    if (stateMatch) {
        parsed.state = (stateMatch[1] || stateMatch[2]).toUpperCase();
        text = text.replace(stateMatch[0], ''); // Remove state
    }

    // 3. Clean up the rest
    text = text.replace(/-$/, '').replace(/,$/, '').trim(); // Remove trailing dashes or commas
    text = text.replace(/CEP[:\s]*/gi, ''); // Clean lingering CEP tags

    // 4. Extract Street, Neighborhood, City
    let streetStr = '';
    let neighborhoodStr = '';
    let cityStr = '';

    // Common pattern: "Street, Number - Neighborhood, City"
    const matchDashComma = text.match(/^(.*?)\s*-\s*(.*?)\s*,\s*(.*)$/);
    if (matchDashComma) {
        streetStr = matchDashComma[1];
        neighborhoodStr = matchDashComma[2];
        cityStr = matchDashComma[3];
    } else {
        // Fallback: protect comma before street number so we don't split the street from its number
        // e.g., "Rua X, 123" or "Rua Y, nº 10" or "Rua Z, s/n"
        let protectedText = text.replace(/,\s*(sn|s\/n|nº|n°|n\.|\b[nN]\b|número|\d+)/gi, '|$1');

        // Now split by remaining commas or dashes
        const segments = protectedText.split(/,| - /).map(s => s.trim().replace(/\|/g, ', ')).filter(s => s.length > 0);

        if (segments.length >= 3) {
            streetStr = segments[0];
            neighborhoodStr = segments[1];
            cityStr = segments.slice(2).join(', ');
        } else if (segments.length === 2) {
            streetStr = segments[0];
            // If it's just 2 segments, it's usually Street and City, or Street and Neighborhood
            cityStr = segments[1];
        } else if (segments.length === 1) {
            streetStr = segments[0];
        }
    }

    // Basic cleanup: Title Case for better presentation
    const toTitleCase = (str: string) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());

    parsed.street = streetStr;
    if (neighborhoodStr) parsed.neighborhood = toTitleCase(neighborhoodStr);
    if (cityStr) parsed.city = toTitleCase(cityStr);
    // Street might have abbreviations like "nº" so title case can be tricky, but we'll apply it mostly
    if (parsed.street) {
        parsed.street = parsed.street.replace(/\b[A-Za-z]+\b/g, (txt) => {
            // Don't modify small words or specific abbreviations if they're handled before or after
            if (txt.toLowerCase() === 'nº' || txt.toLowerCase() === 'n') return txt.toLowerCase() + 'º';
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    }

    return parsed;
}
