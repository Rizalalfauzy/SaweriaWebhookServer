// server.js (debug version)
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Body parser
app.use(bodyParser.json());

// Temp storage untuk donation terakhir
let latestDonation = null;

// Webhook endpoint dari Saweria
app.post("/saweria-webhook", (req, res) => {
    const payload = req.body;

    console.log("===== NEW SAWERIA WEBHOOK =====");
    console.log("RAW PAYLOAD:", JSON.stringify(payload, null, 2));

    // Cek semua field, fallback jika tidak ada
    const username = payload.username || payload.data?.username || "Guest";
    const amount   = payload.amount   || payload.data?.amount   || 0;
    const message  = payload.message  || payload.data?.message  || "";

    latestDonation = {
        username,
        amount,
        message
    };

    console.log("PARSED DONATION DATA:", latestDonation);
    res.sendStatus(200);
});

// Endpoint untuk Roblox LocalScript ambil donation terakhir
app.get("/lastsawer", (req, res) => {
    if (latestDonation) {
        console.log("Sending latest donation to Roblox:", latestDonation);
        res.json({ newSawer: true, data: latestDonation });
        latestDonation = null; // reset setelah dikirim
    } else {
        res.json({ newSawer: false });
    }
});

// Health check
app.get("/", (req, res) => {
    res.json({ status: "OK", message: "Saweria Webhook Server Online" });
});

app.listen(PORT, () => {
    console.log(`Saweria webhook server running on port ${PORT}`);
});
