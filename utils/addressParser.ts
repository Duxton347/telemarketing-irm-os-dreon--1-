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

type KnownCityEntry = {
    canonical: string;
    aliases: string[];
};

const KNOWN_CITY_ENTRIES: KnownCityEntry[] = [
    { canonical: 'Ilhabela', aliases: ['ilhabela', 'ilha bela'] },
    { canonical: 'Caraguatatuba', aliases: ['caraguatatuba', 'caragua'] },
    { canonical: 'S\u00e3o Sebasti\u00e3o', aliases: ['sao sebastiao', 'sao sebasti\u00e3o', 'sao sebastiao sp', 'sao sebasti\u00e3o sp', 'sebastiao'] },
    { canonical: 'Ubatuba', aliases: ['ubatuba'] },
    { canonical: 'Bertioga', aliases: ['bertioga'] },
    { canonical: 'Jacare\u00ed', aliases: ['jacarei', 'jacare\u00ed'] },
    { canonical: 'S\u00e3o Jos\u00e9 dos Campos', aliases: ['sao jose dos campos', 'sao jos\u00e9 dos campos', 'sjc'] },
    { canonical: 'Ca\u00e7apava', aliases: ['cacapava', 'ca\u00e7apava'] },
    { canonical: 'Taubat\u00e9', aliases: ['taubate', 'taubat\u00e9'] },
    { canonical: 'Pindamonhangaba', aliases: ['pindamonhangaba', 'pinda'] },
    { canonical: 'Paraibuna', aliases: ['paraibuna'] },
    { canonical: 'Jambeiro', aliases: ['jambeiro'] },
    { canonical: 'Santa Branca', aliases: ['santa branca'] },
    { canonical: 'Igarat\u00e1', aliases: ['igarata', 'igarat\u00e1'] },
    { canonical: 'Santos', aliases: ['santos'] },
    { canonical: 'Guaruj\u00e1', aliases: ['guaruja', 'guaruj\u00e1'] },
    { canonical: 'S\u00e3o Vicente', aliases: ['sao vicente', 's\u00e3o vicente'] },
    { canonical: 'Praia Grande', aliases: ['praia grande'] },
    { canonical: 'Cubat\u00e3o', aliases: ['cubatao', 'cubat\u00e3o'] },
    { canonical: 'Mongagu\u00e1', aliases: ['mongagua', 'mongagu\u00e1'] },
    { canonical: 'Itanha\u00e9m', aliases: ['itanhaem', 'itanha\u00e9m'] },
    { canonical: 'Peru\u00edbe', aliases: ['peruibe', 'peru\u00edbe'] }
];

const STREET_KEYWORDS = [
    'rua',
    'r',
    'avenida',
    'av',
    'travessa',
    'tv',
    'estrada',
    'estr',
    'rodovia',
    'rod',
    'alameda',
    'al',
    'praca',
    'pra\u00e7a',
    'ladeira',
    'acesso',
    'via'
];

const NEIGHBORHOOD_PREFIXES = [
    'bairro',
    'jd',
    'jardim',
    'vl',
    'vila',
    'condominio',
    'condom\u00ednio',
    'residencial',
    'loteamento',
    'praia',
    'balneario',
    'balne\u00e1rio',
    'centro'
];

const normalizeComparableText = (value?: string) =>
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const toTitleCase = (value: string) =>
    value
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .replace(/\bSn\b/g, 'S/N');

const sanitizeSegment = (value?: string) =>
    String(value || '')
        .replace(/\bcep[:\s]*/gi, '')
        .replace(/^[,\-\s]+|[,\-\s]+$/g, '')
        .trim();

const isLikelyAddressNumberFragment = (value?: string) => {
    const normalized = normalizeComparableText(value);
    if (!normalized) return false;

    return (
        /^(?:n|no|num|numero)?\s*\d+[a-z]?$/.test(normalized) ||
        /^(?:s\/n|sn)$/.test(normalized) ||
        /^km\s*\d+(?:\s*\w+)?$/.test(normalized) ||
        /^\d{5}\s*\d{3}$/.test(normalized)
    );
};

const isStreetLikeSegment = (value?: string) => {
    const raw = String(value || '').trim();
    const normalized = normalizeComparableText(raw);
    if (!normalized) return false;

    if (STREET_KEYWORDS.some(keyword => normalized === keyword || normalized.startsWith(`${keyword} `))) {
        return true;
    }

    return /,\s*(?:\d+|s\/n|sn|n[.\u00ba\u00b0o]?)/i.test(raw);
};

const isNeighborhoodLikeSegment = (value?: string) => {
    const normalized = normalizeComparableText(value);
    if (!normalized) return false;

    return NEIGHBORHOOD_PREFIXES.some(prefix => normalized === prefix || normalized.startsWith(`${prefix} `));
};

export const resolveKnownCity = (value?: string): string | undefined => {
    const normalized = normalizeComparableText(value);
    if (!normalized) return undefined;

    for (const city of KNOWN_CITY_ENTRIES) {
        if (city.aliases.some(alias => normalized === alias || normalized.includes(` ${alias}`) || normalized.endsWith(alias))) {
            return city.canonical;
        }
    }

    return undefined;
};

export const isLikelyInvalidStructuredCity = (value?: string) => {
    const cleaned = sanitizeSegment(value);
    if (!cleaned) return true;

    if (isLikelyAddressNumberFragment(cleaned)) return true;
    if (isStreetLikeSegment(cleaned)) return true;
    if (cleaned.length <= 2) return true;

    return false;
};

export const isLikelyInvalidStructuredNeighborhood = (value?: string) => {
    const cleaned = sanitizeSegment(value);
    if (!cleaned) return true;

    if (isLikelyAddressNumberFragment(cleaned)) return true;
    if (/^\d+$/.test(cleaned)) return true;

    const knownCity = resolveKnownCity(cleaned);
    if (knownCity && normalizeComparableText(knownCity) === normalizeComparableText(cleaned)) {
        return true;
    }

    return false;
};

const inferCityFromSegments = (segments: string[]) => {
    for (let index = segments.length - 1; index >= 0; index -= 1) {
        const segment = sanitizeSegment(segments[index]);
        const knownCity = resolveKnownCity(segment);
        if (knownCity) {
            return { city: knownCity, cityIndex: index };
        }
    }

    for (let index = segments.length - 1; index >= 0; index -= 1) {
        const segment = sanitizeSegment(segments[index]);
        if (isLikelyInvalidStructuredCity(segment)) continue;
        if (isNeighborhoodLikeSegment(segment)) continue;
        return { city: toTitleCase(segment), cityIndex: index };
    }

    return { city: undefined, cityIndex: -1 };
};

const inferNeighborhoodFromSegments = (segments: string[], city?: string, cityIndex?: number) => {
    const startIndex = cityIndex !== undefined && cityIndex > -1 ? cityIndex - 1 : segments.length - 1;

    for (let index = startIndex; index >= 0; index -= 1) {
        const segment = sanitizeSegment(segments[index]);
        if (!segment) continue;
        if (isLikelyInvalidStructuredNeighborhood(segment)) continue;
        if (isStreetLikeSegment(segment) && index === 0) continue;

        const knownCity = resolveKnownCity(segment);
        if (knownCity && city && normalizeComparableText(knownCity) === normalizeComparableText(city)) {
            continue;
        }

        return { neighborhood: toTitleCase(segment), neighborhoodIndex: index };
    }

    return { neighborhood: undefined, neighborhoodIndex: -1 };
};

/**
 * Extracts phones separated by a slash `/` and normalizes them.
 * Assumes the input could be e.g. '12997080894 / 12997080000'
 */
export function parsePhones(rawPhoneStr: string): ParsedPhone {
    if (!rawPhoneStr) return { primary: '' };

    const parts = rawPhoneStr.split('/');
    const cleanedParts = parts.map(part => {
        let cleaned = part.replace(/\D/g, '');

        if (cleaned.startsWith('0') && cleaned.length > 10) {
            cleaned = cleaned.substring(1);
        }

        return cleaned;
    }).filter(part => part.length >= 10);

    return {
        primary: cleanedParts[0] || '',
        secondary: cleanedParts[1] || undefined
    };
}

/**
 * Parses free-form Brazilian addresses using heuristics plus city recognition.
 * Example: Doze, n 08 - Verde Mar, CEP:11677262, Caraguatatuba - SP
 */
export function parseAddress(rawAddressStr: string): ParsedAddress {
    if (!rawAddressStr) return {};

    let text = rawAddressStr.trim();
    const parsed: ParsedAddress = {};

    const zipMatch = text.match(/\b\d{5}-?\d{3}\b/);
    if (zipMatch) {
        parsed.zip_code = zipMatch[0]
            .replace(/\D/g, '')
            .replace(/^(\d{5})(\d{3})$/, '$1-$2');
        text = text
            .replace(/CEP\s*:?\s*\b\d{5}-?\d{3}\b/gi, '')
            .replace(/\b\d{5}-?\d{3}\b/, '');
    }

    text = text.replace(/\s*,?\s*Brasil$/i, '').trim();

    const stateMatch = text.match(/\b-\s*([A-Z]{2})\b|\b([A-Z]{2})\b$/i);
    if (stateMatch) {
        parsed.state = (stateMatch[1] || stateMatch[2]).toUpperCase();
        text = text.replace(stateMatch[0], '');
    }

    text = text
        .replace(/-$/, '')
        .replace(/,$/, '')
        .replace(/CEP[:\s]*/gi, '')
        .trim();

    const protectedText = text.replace(
        /,\s*(sn|s\/n|n[.\u00ba\u00b0o]?|\b[nN]\b|numero|\d+)/gi,
        '|$1'
    );
    const segments = protectedText
        .split(/,|\s+-\s+/)
        .map(segment => sanitizeSegment(segment.replace(/\|/g, ', ')))
        .filter(Boolean);

    const { city, cityIndex } = inferCityFromSegments(segments);
    const { neighborhood, neighborhoodIndex } = inferNeighborhoodFromSegments(segments, city, cityIndex);

    const streetParts = segments.filter((_, index) => {
        if (cityIndex > -1 && index >= cityIndex) return false;
        if (neighborhoodIndex > -1 && index >= neighborhoodIndex) return false;
        return true;
    });

    const street = sanitizeSegment(streetParts.join(', '));

    if (street) {
        parsed.street = toTitleCase(street);
    }
    if (neighborhood && !isLikelyInvalidStructuredNeighborhood(neighborhood)) {
        parsed.neighborhood = neighborhood;
    }
    if (city && !isLikelyInvalidStructuredCity(city)) {
        parsed.city = resolveKnownCity(city) || city;
    }

    if (!parsed.street && segments.length > 0) {
        const fallbackStreet = sanitizeSegment(segments[0]);
        if (fallbackStreet && !resolveKnownCity(fallbackStreet)) {
            parsed.street = toTitleCase(fallbackStreet);
        }
    }

    return parsed;
}
