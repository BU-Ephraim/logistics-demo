import https from "node:https";

const apiUrl = 'https://matikojgprtoxyhjfzhj.supabase.co/rest/v1';
const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hdGlrb2pncHJ0b3h5aGpmemhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MDQyODgsImV4cCI6MjA5NDQ4MDI4OH0.HTSFNZ32k4wL3fySJZGTbfdqWm97MEH137GUXILt2SY';
const adminId = '7d6c5a42-8e3b-4f1a-9c2d-5b6e7f8a9b0c';


function fetchJson(path) {
    return new Promise((resolve, reject) => {
        const request = https.get(
            `${apiUrl}${path}`,
            {
                headers: {
                    apikey: apiKey,
                    Authorization: `Bearer ${apiKey}`,
                },
            },
            (response) => {
                let data = "";

                response.on("data", (chunk) => {
                    data += chunk;
                });

                response.on("end", () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        );

        request.on("error", reject);
    });
}

async function run() {
    try {
        const botSessions = await fetchJson(`/bot_sessions?admin_id=eq.${adminId}`);
        console.log("BOT_SESSIONS:", JSON.stringify(botSessions, null, 2));

        const messages = await fetchJson("/messages?order=created_at.desc&limit=10");
        console.log("MESSAGES:", JSON.stringify(messages, null, 2));

        const orders = await fetchJson(
            `/orders?admin_id=eq.${adminId}&order=created_at.desc&limit=5`
        );
        console.log("ORDERS:", JSON.stringify(orders, null, 2));
    } catch (error) {
        console.error("ERROR:", error);
    }
}
run();
