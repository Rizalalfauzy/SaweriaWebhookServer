const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 3000;

// Simpan donation terbaru
let latestDonation = null;

// Middleware
app.use(bodyParser.json());

// Endpoint webhook dari Saweria
app.post("/saweria-webhook", (req, res) => {
    console.log("===== NEW WEBHOOK CALL =====");
    console.log("RAW BODY:", req.body);

    // Ambil data donasi, fallback jika undefined
    latestDonation = {
        username: req.body.username || "Guest",
        amount: req.body.amount || 0,
        message: req.body.message || ""
    };

    console.log("STORED DONATION:", latestDonation);
    res.sendStatus(200);
});

// Endpoint untuk Roblox LocalScript ambil data terbaru
app.get("/lastsawer", (req, res) => {
    if (latestDonation) {
        res.json({ newSawer: true, data: latestDonation });
        console.log("SENT DONATION TO CLIENT:", latestDonation);
        latestDonation = null; // reset supaya tidak duplikat
    } else {
        res.json({ newSawer: false });
    }
});

// Health check sederhana
app.get("/", (req, res) => {
    res.send("Saweria Webhook Server Online");
});

// Start server
app.listen(PORT, () => console.log(`Saweria webhook server running on port ${PORT}`));
