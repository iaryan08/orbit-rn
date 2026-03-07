"use server";

export async function fetchWeather(lat: number, lon: number) {
    try {
        const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`,
            { next: { revalidate: 3600 } } // Cache for 1 hour
        );
        if (!res.ok) throw new Error("Weather service unreachable");
        const data = await res.json();
        if (data.current_weather) {
            return {
                temp: Math.round(data.current_weather.temperature),
                code: data.current_weather.weathercode,
            };
        }
        return null;
    } catch (error) {
        console.error("Server-side weather fetch error:", error);
        return null;
    }
}
