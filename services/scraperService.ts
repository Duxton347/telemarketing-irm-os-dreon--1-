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

        for (const point of points) {
            try {
                let nextPageToken = '';
                let pages = 0;

                do {
                    const searchUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${point.lat},${point.lng}&radius=${process.radius_km * 1000}&keyword=${encodeURIComponent(process.keyword)}&key=${GOOGLE_MAPS_KEY}${nextPageToken ? `&pagetoken=${nextPageToken}` : ''}`;
                    const searchRes = await fetch(searchUrl);
                    const searchData = await searchRes.json();

                    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
                        throw new Error(`Maps API Error: ${searchData.status}`);
                    }

                    const places = searchData.results || [];

                    for (const place of places) {
                        // Check deduplication
                        const { count } = await supabase
                            .from('scraper_results')
                            .select('*', { count: 'exact', head: true })
                            .eq('google_place_id', place.place_id);

                        if (count === 0) {
                            // Fetch Details (Phone, Website)
                            const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website&key=${GOOGLE_MAPS_KEY}`;
                            const detailsRes = await fetch(detailsUrl);
                            const detailsData = await detailsRes.json();
                            const details = detailsData.result || {};

                            await supabase.from('scraper_results').insert({
                                run_id: run.id,
                                google_place_id: place.place_id,
                                name: details.name || place.name,
                                address: details.formatted_address || place.vicinity,
                                phone: details.formatted_phone_number,
                                website: details.website,
                                rating: null,
                                user_ratings_total: null,
                                types: place.types,
                                location_lat: place.geometry.location.lat,
                                location_lng: place.geometry.location.lng,
                                review_status: 'PENDING',
                                raw_data: { ...place, ...details }
                            });
                            totalNew++;
                        }
                        totalFound++;
                    }

                    nextPageToken = searchData.next_page_token;
                    pages++;

                    if (nextPageToken) await new Promise(resolve => setTimeout(resolve, 2000));
                    if (pages >= 3) nextPageToken = '';

                } while (nextPageToken);

            } catch (err: any) {
                console.error("Scrape Error:", err);
                errors.push(err.message);
            }
        }

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

    // --- INTEGRATIONS ---
    sendToQueue: async (result: ScraperResult, operatorId?: string) => {
        // 1. Create Task
        // 2. Mark Result as APPROVED and Exported
        // Transaction ideally, but sequential for now

        // Check if Client exists first? For now, we create a task linked to the scraper result directly.
        // Actually, 'tasks' usually requires 'client_id'. We might need to CREATE A CLIENT first or allow NULL client_id.
        // The migration scraper_integration added scraper_result_id to tasks.

        // Let's create a Client from the lead first (Leads become Clients in this system?)
        // Or we can create a "Prospect" client.

        // For this system, we'll try to UPSERT a client based on phone.
        let clientId = null;
        if (result.phone) {
            const { data: client } = await supabase.from('clients').upsert({
                name: result.name,
                phone: result.phone.replace(/\D/g, ''),
                address: result.address,
                origin: 'GOOGLE_SEARCH'
            }, { onConflict: 'phone' }).select().single();
            clientId = client?.id;
        }

        const { error } = await supabase.from('tasks').insert({
            client_id: clientId, // Can be null if system allows, otherwise we rely on the upsert above
            type: 'CALL', // Default
            assigned_to: operatorId,
            status: 'pending',
            description: `Lead do Google Maps: ${result.name}`,
            scraper_result_id: result.id
        });

        if (error) throw error;

        await scraperService.updateResultStatus(result.id, 'APPROVED', 'Enviado para Fila');
    }
};
