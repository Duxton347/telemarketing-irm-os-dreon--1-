import dotenv from 'dotenv';
dotenv.config();

const testFetch = async () => {
    // Simulando Ubatuba Pousada num ponto central
    const lat = -23.4332;
    const lng = -45.0711;
    const radius = 5000;
    const keyword = 'pousada';
    const GOOGLE_MAPS_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!GOOGLE_MAPS_KEY) {
        console.error("NO API KEY");
        return;
    }

    // Google API direta
    const searchGoogleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&key=${GOOGLE_MAPS_KEY}`;

    console.log("Fetching: ", searchGoogleUrl);

    try {
        const res = await fetch(searchGoogleUrl);
        console.log("Status:", res.status);
        const data = await res.json();

        console.log("Response Status:", data.status);
        console.log("Total Results:", data.results?.length);
        if (data.error_message) {
            console.error("Error Message:", data.error_message);
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

testFetch();
