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
    // --- EDGE FUNCTION CALLS ---
    verifyLocation: async (input: string) => {
        try {
            const { data, error } = await supabase.functions.invoke('scraper', {
                body: { action: 'verify-location', payload: { input } }
            });
            if (error) {
                console.error('Scraper Function Error:', error);
                throw error;
            }
            return data;
        } catch (e: any) {
            console.error('Failed to invoke verifyLocation:', e);
            throw e;
        }
    },

    runProcess: async (processId: string, userId: string) => {
        const { data, error } = await supabase.functions.invoke('scraper', {
            body: { action: 'run', payload: { processId, userId } }
        });
        if (error) throw error;
        return data; // { success: true, runId: ... }
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
