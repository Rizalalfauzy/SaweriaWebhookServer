// server.js
const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

let latestDonation = null;

// Middleware aman
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Root (biar Railway ga 502)
app.get("/", (req, res) => {
    res.send("Saweria webhook server is running");
});

// Webhook Saweria
app.post("/saweria-webhook", (req, res) => {
    try {
        console.log("PAYLOAD RECEIVED:", req.body);

        const data = req.body || {};
        latestDonation = {
            username: data.username || "Guest",
            amount: data.amount || 0,
            message: data.message || ""
        };

        console.log("Saved donation:", latestDonation);

        res.status(200).json({ success: true });
    } catch (err) {
        console.error("ERROR POST:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// Endpoint diambil Roblox
app.get("/lastsawer", (req, res) => {
    try {
        if (latestDonation) {
            const sendData = { newSawer: true, data: latestDonation };
            latestDonation = null; // reset
            res.json(sendData);
        } else {
            res.json({ newSawer: false });
        }
    } catch (err) {
        console.error("ERROR GET:", err);
        res.status(500).json({ error: "Server error" });
    }
});

app.listen(PORT, () => {
    console.log(`Saweria server running on port ${PORT}`);
});
