
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOOGLE_NEARBY_MAX_RADIUS_METERS = 50000;
const GOOGLE_NEARBY_MIN_RADIUS_METERS = 100;
const GRID_RADIUS_OVERLAP_FACTOR = 1.1;

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { action, payload } = await req.json()

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        const supabase = createClient(
            SUPABASE_URL ?? '',
            SUPABASE_SERVICE_ROLE_KEY ?? ''
        )

        // --- FETCH GOOGLE MAPS KEY ---
        // Try DB first, fall back to ENV
        let GOOGLE_MAPS_KEY = Deno.env.get('GOOGLE_MAPS_KEY');

        try {
            const { data: setting } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'GOOGLE_MAPS_KEY')
                .maybeSingle();

            if (setting?.value) {
                GOOGLE_MAPS_KEY = setting.value;
            }
        } catch (e) {
            console.error("Error fetching system settings:", e);
        }

        if (!GOOGLE_MAPS_KEY) {
            throw new Error('Google Maps API Key not configured in System Settings or Env');
        }

        // --- 1. VERIFY LOCATION (Geocoding) ---
        if (action === 'verify-location') {
            const { input } = payload;
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(input)}&key=${GOOGLE_MAPS_KEY}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.status !== 'OK') {
                return new Response(JSON.stringify({ error: data.status, message: data.error_message }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400
                });
            }

            const result = data.results[0];
            return new Response(JSON.stringify({
                formatted_address: result.formatted_address,
                location: result.geometry.location,
                place_id: result.place_id,
                components: result.address_components
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            });
        }

        if (action === 'places-nearby') {
            const { lat, lng, radius, keyword, nextPageToken } = payload;
            const params = new URLSearchParams({
                location: `${lat},${lng}`,
                radius: String(radius),
                keyword: String(keyword),
                key: GOOGLE_MAPS_KEY
            });

            if (nextPageToken) {
                params.set('pagetoken', String(nextPageToken));
            }

            const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
            const res = await fetch(url);
            const data = await res.json();

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: res.ok ? 200 : 502
            });
        }

        if (action === 'place-details') {
            const { placeId } = payload;
            const params = new URLSearchParams({
                place_id: String(placeId),
                fields: 'name,formatted_address,formatted_phone_number,website,business_status',
                key: GOOGLE_MAPS_KEY
            });

            const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
            const res = await fetch(url);
            const data = await res.json();

            return new Response(JSON.stringify(data), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: res.ok ? 200 : 502
            });
        }

        // --- 2. EXECUTE RUN ---
        if (action === 'run') {
            const { processId, userId } = payload;

            // 1. Fetch Process
            const { data: process, error: procError } = await supabase
                .from('scraper_processes')
                .select('*')
                .eq('id', processId)
                .single();

            if (procError || !process) throw new Error("Process not found");

            // 2. Create Run Entry
            const { data: run, error: runError } = await supabase
                .from('scraper_runs')
                .insert({
                    process_id: processId,
                    status: 'RUNNING',
                    started_at: new Date().toISOString(),
                    created_by: userId
                })
                .select()
                .single();

            if (runError) throw runError;

            // 3. GENERATE GRID
            const gridSize = process.grid_size || 1;
            const searchRadiusMeters = getSearchRadiusMetersForGrid(process.radius_km, gridSize);
            const points = generateGridPoints(process.resolved_lat, process.resolved_lng, process.radius_km, gridSize);

            // 4. SCRAPE LOOP
            let totalFound = 0;
            let totalNew = 0;
            let errors = [];
            const seenPlaceIds = new Set<string>();

            for (const point of points) {
                try {
                    // Nearby Search
                    let nextPageToken = '';
                    let pages = 0;

                    do {
                        const searchUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${point.lat},${point.lng}&radius=${searchRadiusMeters}&keyword=${encodeURIComponent(process.keyword)}&key=${GOOGLE_MAPS_KEY}${nextPageToken ? `&pagetoken=${nextPageToken}` : ''}`;
                        const searchRes = await fetch(searchUrl);
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

                            // Check deduplication (place_id)
                            const { count } = await supabase
                                .from('scraper_results')
                                .select('*', { count: 'exact', head: true })
                                .eq('google_place_id', place.place_id);

                            // Also check clients table for phone/name match (future enhancement)

                            if (count === 0) {
                                // Fetch Details (Phone, Website) - Costly!
                                // Only fetch details if we really need them. Basic search gives name/vicinity/geometry.
                                // To get Phone/Website we NEED Details.
                                // Fetch Details (Phone) - Costly but necessary for Telemarketing
                                // User requested ONLY: Name, Phone, Address.
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
                                    rating: null, // User requested to exclude
                                    user_ratings_total: null, // User requested to exclude
                                    types: place.types, // Keep types from search result as it's free/useful for filtering
                                    location_lat: place.geometry.location.lat,
                                    location_lng: place.geometry.location.lng,
                                    review_status: 'PENDING',
                                    raw_data: { ...place, ...details }
                                });
                                totalNew++;
                            }
                        }

                        nextPageToken = searchData.next_page_token;
                        pages++;

                        // Artificial delay for next_page_token to become valid
                        if (nextPageToken) await new Promise(resolve => setTimeout(resolve, 2000));

                        // Limit pages to avoid huge bills
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

            return new Response(JSON.stringify({ success: true, runId: run.id, totalNew }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            });
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        })
    }
})

// --- HELPER FUNCTIONS (Ported from Python) ---

function kmToDegLat(km: number): number {
    return km / 111.0;
}

function kmToDegLng(km: number, latDeg: number): number {
    const latRad = latDeg * (Math.PI / 180);
    return km / (111.0 * Math.cos(latRad));
}

function clampSearchRadiusMeters(radiusMeters: number): number {
    return Math.max(
        GOOGLE_NEARBY_MIN_RADIUS_METERS,
        Math.min(GOOGLE_NEARBY_MAX_RADIUS_METERS, Math.round(radiusMeters))
    );
}

function getSearchRadiusMetersForGrid(radiusKm: number, gridSize: number): number {
    if (gridSize <= 1) return clampSearchRadiusMeters(radiusKm * 1000);

    const cellSizeKm = (radiusKm * 2) / gridSize;
    const cellCoverRadiusKm = (Math.sqrt(2) * cellSizeKm) / 2;
    return clampSearchRadiusMeters(Math.min(radiusKm, cellCoverRadiusKm * GRID_RADIUS_OVERLAP_FACTOR) * 1000);
}

function generateGridPoints(centerLat: number, centerLng: number, radiusKm: number, gridSize: number): { lat: number, lng: number }[] {
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
}
