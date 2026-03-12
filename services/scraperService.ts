import { supabase } from '../lib/supabase';

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

export const scraperService = {
    parseGoogleAddress: (fullAddress: string) => {
        let neighborhood = null;
        let city = null;
        let state = null;

        if (!fullAddress) return { neighborhood, city, state };

        const cleanAddr = fullAddress.trim();
        const stateMatch = cleanAddr.match(/\b([A-Z]{2})(?:,?\s*Brasil)?$/i);
        if (stateMatch) state = stateMatch[1].toUpperCase();

        let str = cleanAddr.replace(/(?:CEP:?\s*)?(\d{5}-?\d{3})/i, '').replace(/Brasil\s*$/i, '').trim();
        str = str.replace(/[,-\s]+$/, '');

        if (state && str.endsWith(state)) {
            str = str.slice(0, -state.length).trim();
            str = str.replace(/[,-\s]+$/, '');
        }

        const partsByComma = str.split(',').map(s => s.trim()).filter(Boolean);
        
        if (partsByComma.length > 1) {
            let potentialCity = partsByComma[partsByComma.length - 1];
            if (potentialCity.includes('-')) {
                const subParts = potentialCity.split('-').map(s => s.trim());
                city = subParts[subParts.length - 1];
                neighborhood = subParts[subParts.length - 2];
            } else {
                city = potentialCity;
                let beforeCity = partsByComma.slice(0, -1).join(',').trim();
                if (beforeCity.includes('-')) {
                    const subParts = beforeCity.split('-').map(s => s.trim());
                    neighborhood = subParts[subParts.length - 1];
                }
            }
        } else if (str.includes('-')) {
            const parts = str.split('-').map(s => s.trim());
            if (parts.length >= 3) {
                city = parts[parts.length - 1];
                neighborhood = parts[parts.length - 2];
            } else if (parts.length === 2) {
                city = parts[1];
            }
        }

        if (city && city.length <= 2) city = null;
        if (neighborhood && neighborhood.length <= 2) neighborhood = null;
        if (city?.toUpperCase() === 'ILHABELA') city = 'ILHABELA';

        return { 
            neighborhood: neighborhood || null, 
            city: city?.toUpperCase() || null, 
            state: state || null 
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

        // Helpers for Grid Generation
        const kmToDegLat = (km: number) => km / 111.0;
        const kmToDegLng = (km: number, latDeg: number) => {
            const latRad = latDeg * (Math.PI / 180);
            return km / (111.0 * Math.cos(latRad));
        };

        const generateGridPoints = (centerLat: number, centerLng: number, radiusKm: number, gridSize: number) => {
            if (gridSize <= 1) return [{ lat: centerLat, lng: centerLng }];
            const halfSpanKm = radiusKm;
            const stepKm = (2 * halfSpanKm) / (gridSize - 1);
            const points = [];
            for (let i = 0; i < gridSize; i++) {
                for (let j = 0; j < gridSize; j++) {
                    const offsetLatKm = -halfSpanKm + i * stepKm;
                    const offsetLngKm = -halfSpanKm + j * stepKm;
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

        try {
            for (const point of points) {
                try {
                    let nextPageToken = '';
                    let pages = 0;

                    do {
                        const searchGoogleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${point.lat},${point.lng}&radius=${process.radius_km * 1000}&keyword=${encodeURIComponent(process.keyword)}&key=${GOOGLE_MAPS_KEY}${nextPageToken ? `&pagetoken=${nextPageToken}` : ''}`;
                        const searchUrl = import.meta.env.PROD ? `https://corsproxy.io/?${encodeURIComponent(searchGoogleUrl)}` : `/google-proxy/maps/api/place/nearbysearch/json?location=${point.lat},${point.lng}&radius=${process.radius_km * 1000}&keyword=${encodeURIComponent(process.keyword)}&key=${GOOGLE_MAPS_KEY}${nextPageToken ? `&pagetoken=${nextPageToken}` : ''}`;
                        const searchRes = await fetch(searchUrl);
                        if (!searchRes.ok) throw new Error(`Network Error: ${searchRes.statusText}`);
                        const searchData = await searchRes.json();

                        if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
                            throw new Error(`Maps API Error: ${searchData.status}`);
                        }

                        const places = searchData.results || [];

                        for (const place of places) {
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
                            totalFound++;
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
    getResults: async (filters?: { status?: string, runId?: string }) => {
        let query = supabase
            .from('scraper_results')
            .select('*, scraper_runs(scraper_processes(name))')
            .order('created_at', { ascending: false });

        if (filters?.status) query = query.eq('review_status', filters.status);
        if (filters?.runId) query = query.eq('run_id', filters.runId);

        const { data, error } = await query.limit(100);
        if (error) throw error;
        return data as ScraperResult[];
    },

    updateResultStatus: async (id: string, status: string, notes?: string, userId?: string) => {
        const update: any = { review_status: status, reviewed_at: new Date().toISOString() };
        if (notes) update.review_notes = notes;
        if (userId) update.reviewed_by = userId;

        const { error } = await supabase.from('scraper_results').update(update).eq('id', id);
        if (error) throw error;
    },

    forceCompleteRun: async (runId: string) => {
        // Conta os resultados encontrados no banco
        const { count: foundCount } = await supabase
            .from('scraper_results')
            .select('*', { count: 'exact', head: true })
            .eq('run_id', runId);

        const { error } = await supabase
            .from('scraper_runs')
            .update({
                status: 'COMPLETED',
                total_found: foundCount || 0,
                total_new: foundCount || 0, // Estimativa para execuções recuperadas
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
        const originString = processName ? `GOOGLE_SEARCH (${processName})` : 'GOOGLE_SEARCH';

        // Tentar preencher location parts
        const parsed = scraperService.parseGoogleAddress(result.address);

        // Tentamos fazer Upsert baseado no telefone
        const { error: upsertError } = await supabase.from('clients').upsert({
            name: result.name,
            phone: phoneCleaner,
            address: result.address,
            neighborhood: parsed.neighborhood,
            city: parsed.city,
            state: parsed.state,
            website: result.website || null,
            origin: originString,
            status: 'LEAD',
            funnel_status: 'NEW'
        }, { onConflict: 'phone' });

        if (upsertError) throw upsertError;

        await scraperService.updateResultStatus(result.id, 'APPROVED', 'Salvo no CRM de Leads', userId);
    }
};
