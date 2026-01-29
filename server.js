// server.js
const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

let latestDonation = null;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Root untuk cek server
app.get("/", (req, res) => res.send("Saweria webhook server running"));

// Endpoint webhook dari Saweria atau test
app.post("/saweria-webhook", (req, res) => {
    console.log("PAYLOAD RECEIVED:", req.body);

    const data = req.body || {};

    // Ambil nama dan nominal dari semua kemungkinan field
    latestDonation = {
        username: data.donator_name || data.name || "Someone",
        amount: data.amount_raw || data.value || 0,
        message: data.message || ""
    };

    console.log("New donation stored:", latestDonation);
    res.status(200).json({ success: true });
});

// Endpoint untuk Roblox LocalScript
app.get("/lastsawer", (req, res) => {
    if (latestDonation) {
        res.json({ newSawer: true, data: latestDonation });
        latestDonation = null; // reset setelah dikirim
    } else {
        res.json({ newSawer: false });
    }
});

app.listen(PORT, () => console.log(`Saweria webhook server running on port ${PORT}`));
