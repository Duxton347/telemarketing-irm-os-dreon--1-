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

export const scraperService = {
    parseGoogleAddress: (fullAddress: string) => {
        const parsed = parseAddress(fullAddress);
        return {
            neighborhood: parsed.neighborhood || null,
            city: parsed.city || null,
            state: parsed.state || null
        };
    },

    verifyLocation: async (input: string) => {
        // A verificação agora é feita no componente para obter a chave dinamicamente
        return null;
    },

    runProcess: async (processId: string, userId: string): Promise<any> => {
        // Busca a chave do Google das configurações do sistema
        const { data: setting } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'GOOGLE_MAPS_KEY')
            .maybeSingle();

        const GOOGLE_MAPS_KEY = setting?.value;

        if (!GOOGLE_MAPS_KEY) {
            throw new Error("Chave do Google Maps não configurada. Cadastre 'GOOGLE_MAPS_KEY' nas configurações.");
        }

        // 1. Fetch Process
        const { data: process, error: procError } = await supabase
            .from('scraper_processes')
            .select('*')
            .eq('id', processId)
            .single();

        if (procError || !process) throw new Error("Processo não encontrado no banco de dados.");

        // 2. Create Run Entry
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

        if (runError) throw new Error(`Falha ao iniciar corrida: ${runError.message}`);

        // 3. GENERATE GRID
        const gridSize = process.grid_size || 1;
        const searchRadiusMeters = getSearchRadiusMetersForGrid(process.radius_km, gridSize);

        // Helpers for Grid Generation
        const kmToDegLat = (km: number) => km / 111.0;
        const kmToDegLng = (km: number, latDeg: number) => {
            const latRad = latDeg * (Math.PI / 180);
            return km / (111.0 * Math.cos(latRad));
        };

        const generateGridPoints = (centerLat: number, centerLng: number, radiusKm: number, gridSize: number) => {
            if (gridSize <= 1) return [{ lat: centerLat, lng: centerLng }];
            const cellSizeKm = (2 * radiusKm) / gridSize;
            const points = [];
            for (let i = 0; i < gridSize; i++) {
                for (let j = 0; j < gridSize; j++) {
                    const offsetLatKm = -radiusKm + (i + 0.5) * cellSizeKm;
                    const offsetLngKm = -radiusKm + (j + 0.5) * cellSizeKm;
                    const dlat = kmToDegLat(offsetLatKm);
                    const dlng = kmToDegLng(offsetLngKm, centerLat);
                    points.push({ lat: centerLat + dlat, lng: centerLng + dlng });
                }
            }
            return points;
        };

        const points = generateGridPoints(process.resolved_lat, process.resolved_lng, process.radius_km, gridSize);

        // 4. SCRAPE LOOP
        let totalFound = 0;
        let totalNew = 0;
        let errors = [];
        const seenPlaceIds = new Set<string>();

        try {
            for (const point of points) {
                try {
                    let nextPageToken = '';
                    let pages = 0;

                    do {
                        const searchGoogleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${point.lat},${point.lng}&radius=${searchRadiusMeters}&keyword=${encodeURIComponent(process.keyword)}&key=${GOOGLE_MAPS_KEY}${nextPageToken ? `&pagetoken=${nextPageToken}` : ''}`;
                        const searchUrl = import.meta.env.PROD ? `https://corsproxy.io/?${encodeURIComponent(searchGoogleUrl)}` : `/google-proxy/maps/api/place/nearbysearch/json?location=${point.lat},${point.lng}&radius=${searchRadiusMeters}&keyword=${encodeURIComponent(process.keyword)}&key=${GOOGLE_MAPS_KEY}${nextPageToken ? `&pagetoken=${nextPageToken}` : ''}`;
                        const searchRes = await fetch(searchUrl);
                        if (!searchRes.ok) throw new Error(`Network Error: ${searchRes.statusText}`);
                        const searchData = await searchRes.json();

                        if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
                            throw new Error(`Maps API Error: ${searchData.status}`);
                        }

                        const places = (searchData.results || []).filter((place: any) => {
                            const placeId = place?.place_id;
                            if (!placeId || seenPlaceIds.has(placeId)) {
                                return false;
                            }

                            seenPlaceIds.add(placeId);
                            return true;
                        });

                        for (const place of places) {
                            totalFound++;

                            // Check deduplication (Local Scraper DB + CRM DB)
                            const { count } = await supabase
                                .from('scraper_results')
                                .select('*', { count: 'exact', head: true })
                                .eq('google_place_id', place.place_id);

                            // We will fetch details first before CRM check to get the phone number
                            if (count === 0) {
                                // Fetch Details
                                const detailsGoogleUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,business_status&key=${GOOGLE_MAPS_KEY}`;
                                const detailsUrl = import.meta.env.PROD ? `https://corsproxy.io/?${encodeURIComponent(detailsGoogleUrl)}` : `/google-proxy/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,business_status&key=${GOOGLE_MAPS_KEY}`;
                                const detailsRes = await fetch(detailsUrl);
                                const detailsData = await detailsRes.ok ? await detailsRes.json() : {};
                                const details = detailsData.result || {};

                                let isCrmDuplicate = false;

                                if (details.formatted_phone_number) {
                                    const phoneCleaner = details.formatted_phone_number.replace(/\D/g, '');
                                    if (phoneCleaner.length > 3) {
                                        const { count: clientCount } = await supabase
                                            .from('clients')
                                            .select('*', { count: 'exact', head: true })
                                            .eq('phone', phoneCleaner);

                                        if (clientCount && clientCount > 0) {
                                            isCrmDuplicate = true;
                                        }
                                    }
                                }

                                if (!isCrmDuplicate) {
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
                                } // end if !isCrmDuplicate
                            }
                        }

                        nextPageToken = searchData.next_page_token;
                        pages++;

                        if (nextPageToken) await new Promise(resolve => setTimeout(resolve, 2000));
                        if (pages >= 3) nextPageToken = '';

                    } while (nextPageToken);

                } catch (err: any) {
                    console.error("Scrape Error for point:", point, err);
                    errors.push(err.message);
                }
            }
        } finally {
            // 5. UPDATE RUN
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

        return { success: true, runId: run.id, totalNew };
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
