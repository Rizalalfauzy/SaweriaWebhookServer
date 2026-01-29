// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

let latestDonation = null;

app.use(cors());
app.use(bodyParser.json());

// Webhook dari Saweria (POST)
app.post("/saweria-webhook", (req, res) => {
    console.log("RAW PAYLOAD:", req.body);

    // Pastikan format sesuai Saweria
    if (!req.body || !req.body.data) {
        console.log("Payload tidak valid / tidak ada body.data");
        return res.sendStatus(200);
    }

    const d = req.body.data;

    latestDonation = {
        username: d.username || "Guest",
        amount: d.amount || 0,
        message: d.message || ""
    };

    console.log("Stored Donation:", latestDonation);
    res.sendStatus(200);
});

// Roblox GET /lastsawer
app.get("/lastsawer", (req, res) => {
    if (latestDonation) {
        res.json({ newSawer: true, data: latestDonation });
        latestDonation = null;
    } else {
        res.json({ newSawer: false });
    }
});

app.listen(PORT, () => {
    console.log(`Saweria webhook server running on port ${PORT}`);
});
