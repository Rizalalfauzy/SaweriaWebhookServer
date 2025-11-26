// server.js
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 3000;

let latestDonation = null;

app.use(bodyParser.json());

// Endpoint webhook dari Saweria
app.post("/saweria-webhook", (req, res) => {
    console.log("PAYLOAD RECEIVED:", req.body); // debug untuk cek data asli

    // Ambil field yang ada, fallback jika undefined
    latestDonation = {
        username: req.body.username || "Guest",
        amount: req.body.amount || 0,
        message: req.body.message || ""
    };

    console.log("New donation stored:", latestDonation);
    res.sendStatus(200);
});

// Endpoint untuk Roblox LocalScript /lastsawer
app.get("/lastsawer", (req, res) => {
    if (latestDonation) {
        res.json({ newSawer: true, data: latestDonation });
        latestDonation = null; // reset setelah dikirim ke Roblox
    } else {
        res.json({ newSawer: false });
    }
});

app.listen(PORT, () => console.log(`Saweria webhook server running on port ${PORT}`));
