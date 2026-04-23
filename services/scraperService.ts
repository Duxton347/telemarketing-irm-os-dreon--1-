import { supabase } from '../lib/supabase';
import { dataService } from './dataService';
import { parseAddress } from '../utils/addressParser';

export interface ScraperProcess {
    id?: string;
    name: string;
    description?: string;
    keyword: string;
    location_input: string;
    radius_km: number;
    grid_size?: number;
    resolved_address?: string;
    resolved_lat?: number;
    resolved_lng?: number;
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    created_at?: string;
}

export interface ScraperRun {
    id: string;
    process_id: string;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    started_at: string;
    finished_at?: string;
    total_found: number;
    total_new: number;
    cost_estimate_usd: number;
    error_log?: string;
    scraper_processes?: ScraperProcess; // Join
}

export interface ScraperResult {
    id: string;
    run_id: string;
    name: string;
    address: string;
    phone?: string;
    website?: string;
    google_place_id: string;
    review_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'IGNORED' | 'MERGED';
    duplication_score: number;
    scraper_runs?: ScraperRun; // Join
    // ... other fields
}

type ScraperResultsFilters = {
    status?: string;
    runId?: string;
};

type ScraperResultsOptions = {
    limit?: number;
};

const SCRAPER_RESULTS_PAGE_SIZE = 1000;
const GOOGLE_NEARBY_MAX_RADIUS_METERS = 50000;
const GOOGLE_NEARBY_MIN_RADIUS_METERS = 100;
const GRID_RADIUS_OVERLAP_FACTOR = 1.1;

export interface ScraperLocationVerification {
    formatted_address: string;
    location: {
        lat: number;
        lng: number;
    };
    place_id: string;
    components?: unknown[];
}

type ScraperFunctionAction = 'verify-location' | 'places-nearby' | 'place-details';

type GridPoint = {
    lat: number;
    lng: number;
};

type GoogleNearbyResponse = {
    status: string;
    error_message?: string;
    results?: any[];
    next_page_token?: string;
};

type GoogleDetailsResponse = {
    status?: string;
    error_message?: string;
    result?: any;
};

const getFunctionErrorMessage = async (error: unknown) => {
    const fallback = error instanceof Error ? error.message : 'Falha ao chamar a funcao do scraper.';
    const context = (error as { context?: Response } | null | undefined)?.context;

    if (!context || typeof context.clone !== 'function') {
        return fallback;
    }

    try {
        const body = await context.clone().json();
        if (body?.message) return String(body.message);
        if (body?.error) return String(body.error);
    } catch {
        // Keep the original Supabase error when the function did not return JSON.
    }

    return fallback;
};

const invokeScraperFunction = async <T>(action: ScraperFunctionAction, payload: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.functions.invoke('scraper', {
        body: { action, payload }
    });

    if (error) {
        throw new Error(await getFunctionErrorMessage(error));
    }

    if (data && typeof data === 'object' && 'error' in data) {
        const body = data as { error?: string; message?: string };
        throw new Error(body.message || body.error || 'Falha ao executar scraper.');
    }

    return data as T;
};

const buildResultsQuery = (filters?: ScraperResultsFilters) => {
    let query = supabase
        .from('scraper_results')
        .select('*, scraper_runs(scraper_processes(name))')
        .order('created_at', { ascending: false });

    if (filters?.status) query = query.eq('review_status', filters.status);
    if (filters?.runId) query = query.eq('run_id', filters.runId);

    return query;
};

const clampSearchRadiusMeters = (radiusMeters: number) =>
    Math.max(
        GOOGLE_NEARBY_MIN_RADIUS_METERS,
        Math.min(GOOGLE_NEARBY_MAX_RADIUS_METERS, Math.round(radiusMeters))
    );

const getSearchRadiusMetersForGrid = (radiusKm: number, gridSize: number) => {
    if (gridSize <= 1) {
        return clampSearchRadiusMeters(radiusKm * 1000);
    }

    const cellSizeKm = (radiusKm * 2) / gridSize;
    const cellCoverRadiusKm = (Math.sqrt(2) * cellSizeKm) / 2;
    return clampSearchRadiusMeters(Math.min(radiusKm, cellCoverRadiusKm * GRID_RADIUS_OVERLAP_FACTOR) * 1000);
};

const kmToDegLat = (km: number) => km / 111.0;

const kmToDegLng = (km: number, latDeg: number) => {
    const latRad = latDeg * (Math.PI / 180);
    return km / (111.0 * Math.cos(latRad));
};

const generateGridPoints = (centerLat: number, centerLng: number, radiusKm: number, gridSize: number): GridPoint[] => {
    if (gridSize <= 1) return [{ lat: centerLat, lng: centerLng }];

    const cellSizeKm = (2 * radiusKm) / gridSize;
    const points: GridPoint[] = [];

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const offsetLatKm = -radiusKm + (i + 0.5) * cellSizeKm;
            const offsetLngKm = -radiusKm + (j + 0.5) * cellSizeKm;
            points.push({
                lat: centerLat + kmToDegLat(offsetLatKm),
                lng: centerLng + kmToDegLng(offsetLngKm, centerLat)
            });
        }
    }

    return points;
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const scraperService = {
    parseGoogleAddress: (fullAddress: string) => {
        const parsed = parseAddress(fullAddress);
        return {
            neighborhood: parsed.neighborhood || null,
            city: parsed.city || null,
            state: parsed.state || null
        };
    },

    verifyLocation: async (input: string) =>
        invokeScraperFunction<ScraperLocationVerification>('verify-location', { input }),

    runProcess: async (processId: string, userId: string): Promise<any> => {
        const { data: process, error: procError } = await supabase
            .from('scraper_processes')
            .select('*')
            .eq('id', processId)
            .single();

        if (procError || !process) throw new Error("Processo não encontrado no banco de dados.");

        const { data: run, error: runError } = await supabase
            .from('scraper_runs')
            .insert({
                process_id: processId,
                status: 'RUNNING',
                started_at: new Date().toISOString(),
                created_by: userId || null
            })
            .select()
            .single();

        if (runError) throw new Error(`Falha ao iniciar execução: ${runError.message}`);

        const gridSize = process.grid_size || 1;
        const radiusKm = Number(process.radius_km || 1);
        const searchRadiusMeters = getSearchRadiusMetersForGrid(radiusKm, gridSize);
        const points = generateGridPoints(
            Number(process.resolved_lat),
            Number(process.resolved_lng),
            radiusKm,
            gridSize
        );

        let totalFound = 0;
        let totalNew = 0;
        const errors: string[] = [];
        const seenPlaceIds = new Set<string>();

        try {
            for (const point of points) {
                try {
                    let nextPageToken = '';
                    let pages = 0;

                    do {
                        const searchData = await invokeScraperFunction<GoogleNearbyResponse>('places-nearby', {
                            lat: point.lat,
                            lng: point.lng,
                            radius: searchRadiusMeters,
                            keyword: process.keyword,
                            nextPageToken: nextPageToken || undefined
                        });

                        if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
                            throw new Error(`Maps API Error: ${searchData.status}${searchData.error_message ? ` - ${searchData.error_message}` : ''}`);
                        }

                        const places = (searchData.results || []).filter((place: any) => {
                            const placeId = place?.place_id;
                            if (!placeId || seenPlaceIds.has(placeId)) return false;

                            seenPlaceIds.add(placeId);
                            return true;
                        });

                        for (const place of places) {
                            totalFound++;

                            const { count, error: countError } = await supabase
                                .from('scraper_results')
                                .select('*', { count: 'exact', head: true })
                                .eq('google_place_id', place.place_id);

                            if (countError) throw new Error(`DB Count Error: ${countError.message}`);
                            if (count !== 0) continue;

                            const detailsData = await invokeScraperFunction<GoogleDetailsResponse>('place-details', {
                                placeId: place.place_id
                            });

                            if (detailsData.status && detailsData.status !== 'OK') {
                                throw new Error(`Maps Details Error: ${detailsData.status}${detailsData.error_message ? ` - ${detailsData.error_message}` : ''}`);
                            }

                            const details = detailsData.result || {};
                            let isCrmDuplicate = false;

                            if (details.formatted_phone_number) {
                                const phoneCleaner = details.formatted_phone_number.replace(/\D/g, '');
                                if (phoneCleaner.length > 3) {
                                    const { count: clientCount, error: clientCountError } = await supabase
                                        .from('clients')
                                        .select('*', { count: 'exact', head: true })
                                        .eq('phone', phoneCleaner);

                                    if (clientCountError) throw new Error(`DB Client Count Error: ${clientCountError.message}`);
                                    isCrmDuplicate = Boolean(clientCount && clientCount > 0);
                                }
                            }

                            if (isCrmDuplicate) continue;

                            const { error: insertError } = await supabase.from('scraper_results').insert({
                                run_id: run.id,
                                google_place_id: place.place_id,
                                name: details.name || place.name,
                                address: details.formatted_address || place.vicinity,
                                phone: details.formatted_phone_number,
                                website: details.website,
                                types: place.types,
                                location_lat: place.geometry.location.lat,
                                location_lng: place.geometry.location.lng,
                                review_status: 'PENDING',
                                raw_data: { ...place, ...details }
                            });

                            if (insertError) throw new Error(`DB Insert Error: ${insertError.message}`);
                            totalNew++;
                        }

                        nextPageToken = searchData.next_page_token || '';
                        pages++;

                        if (nextPageToken) await wait(2000);
                        if (pages >= 3) nextPageToken = '';
                    } while (nextPageToken);
                } catch (err: any) {
                    console.error("Scrape Error for point:", point, err);
                    errors.push(`${JSON.stringify(point)} | ${err.message || String(err)}`);
                }
            }
        } finally {
            await supabase
                .from('scraper_runs')
                .update({
                    status: errors.length > 0 && totalFound === 0 ? 'FAILED' : 'COMPLETED',
                    finished_at: new Date().toISOString(),
                    total_found: totalFound,
                    total_new: totalNew,
                    error_log: errors.join('\n')
                })
                .eq('id', run.id);
        }

        return { success: true, runId: run.id, totalFound, totalNew, errors };
    },

    // --- DB OPERATIONS: PROCESSES ---
    getProcesses: async () => {
        const { data, error } = await supabase
            .from('scraper_processes')
            .select('*')
            .neq('status', 'ARCHIVED')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data as ScraperProcess[];
    },

    saveProcess: async (process: ScraperProcess) => {
        if (!process.id) {
            // Check if exact same process exists
            const { count, error: checkError } = await supabase
                .from('scraper_processes')
                .select('*', { count: 'exact', head: true })
                .eq('keyword', process.keyword)
                .eq('location_input', process.location_input)
                .eq('radius_km', process.radius_km)
                .eq('grid_size', process.grid_size)
                .neq('status', 'ARCHIVED');

            if (checkError) throw checkError;
            if (count && count > 0) throw new Error("Já existe um processo ativo com os mesmos parâmetros (Palavra, Localização, Raio e Grid).");
        }

        if (process.id) {
            const { error } = await supabase.from('scraper_processes').update(process).eq('id', process.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('scraper_processes').insert(process);
            if (error) throw error;
        }
    },

    deleteProcess: async (id: string) => {
        // Soft delete
        const { error } = await supabase.from('scraper_processes').update({ status: 'ARCHIVED' }).eq('id', id);
        if (error) throw error;
    },

    // --- DB OPERATIONS: RUNS ---
    getRuns: async () => {
        const { data, error } = await supabase
            .from('scraper_runs')
            .select('*, scraper_processes(name)')
            .order('started_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        return data;
    },

    // --- DB OPERATIONS: RESULTS ---
    getResults: async (filters?: ScraperResultsFilters, options: ScraperResultsOptions = {}) => {
        const limit = options.limit ?? 100;
        const { data, error } = await buildResultsQuery(filters).limit(limit);
        if (error) throw error;
        return data as ScraperResult[];
    },

    getAllResults: async (filters?: ScraperResultsFilters) => {
        const allResults: ScraperResult[] = [];
        let from = 0;

        while (true) {
            const to = from + SCRAPER_RESULTS_PAGE_SIZE - 1;
            const { data, error } = await buildResultsQuery(filters).range(from, to);

            if (error) throw error;

            const batch = (data || []) as ScraperResult[];
            allResults.push(...batch);

            if (batch.length < SCRAPER_RESULTS_PAGE_SIZE) break;
            from += SCRAPER_RESULTS_PAGE_SIZE;
        }

        return allResults;
    },

    updateResultStatus: async (id: string, status: string, notes?: string, userId?: string) => {
        const update: any = { review_status: status, reviewed_at: new Date().toISOString() };
        if (notes) update.review_notes = notes;
        if (userId) update.reviewed_by = userId;

        const { error } = await supabase.from('scraper_results').update(update).eq('id', id);
        if (error) throw error;
    },

    forceCompleteRun: async (runId: string) => {
        const [{ data: run, error: runError }, { count: foundCount, error: countError }] = await Promise.all([
            supabase
                .from('scraper_runs')
                .select('total_found, total_new')
                .eq('id', runId)
                .maybeSingle(),
            supabase
                .from('scraper_results')
                .select('*', { count: 'exact', head: true })
                .eq('run_id', runId)
        ]);

        if (runError) throw new Error("Erro ao carregar execução: " + runError.message);
        if (countError) throw new Error("Erro ao contar resultados da execução: " + countError.message);

        const safeFoundCount = foundCount || 0;
        const totalFound = Math.max(run?.total_found || 0, safeFoundCount);
        const totalNew = Math.max(run?.total_new || 0, safeFoundCount);

        const { error } = await supabase
            .from('scraper_runs')
            .update({
                status: 'COMPLETED',
                total_found: totalFound,
                total_new: totalNew,
                finished_at: new Date().toISOString()
            })
            .eq('id', runId);

        if (error) throw new Error("Erro ao concluir execução: " + error.message);
    },

    deleteRun: async (runId: string) => {
        // Primeiro remove os resultados pendentes para não deixar órfãos
        await supabase.from('scraper_results').delete().eq('run_id', runId).eq('review_status', 'PENDING');
        const { error } = await supabase.from('scraper_runs').delete().eq('id', runId);
        if (error) throw new Error("Erro ao excluir execução: " + error.message);
    },

    // --- INTEGRATIONS ---
    // --- INTEGRATIONS ---
    approveLead: async (result: ScraperResult, userId?: string, processName?: string) => {
        // Marks Result as APPROVED and upserts into the 'clients' table as a LEAD.
        // It DOES NOT dispatch to calls queue anymore. Bulk dispatching handles that later.

        if (!result.phone) {
            // Se não tem telefone, a gente ainda aprova e marca no scraper_results, mas não tenta upsert sem telefone
            await scraperService.updateResultStatus(result.id, 'APPROVED', 'Sem telefone, salvo apenas no Scraper', userId);
            return;
        }

        const phoneCleaner = result.phone.replace(/\D/g, '');

        await dataService.upsertClient({
            name: result.name,
            phone: phoneCleaner,
            address: result.address,
            website: result.website || undefined,
            origin: 'GOOGLE_SEARCH',
            origin_detail: processName || undefined,
            status: 'LEAD',
            funnel_status: 'NEW'
        });

        await scraperService.updateResultStatus(
            result.id,
            'APPROVED',
            processName ? `Salvo no CRM de Leads (${processName})` : 'Salvo no CRM de Leads',
            userId
        );
    }
};
