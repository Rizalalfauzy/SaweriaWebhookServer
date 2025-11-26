// server.js
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 3000;

let latestDonation = null;

// Middleware JSON
app.use(bodyParser.json());

// Endpoint untuk menerima webhook dari Saweria
app.post("/saweria-webhook", (req, res) => {
    const data = req.body;

    // Ambil field sesuai payload Saweria asli
    latestDonation = {
        username: data.donor || "Guest",
        amount: data.value || 0,
        message: data.note || ""
    };

    console.log("New donation:", latestDonation);
    res.sendStatus(200);
});

// Endpoint untuk Roblox ambil data terbaru
app.get("/lastsawer", (req, res) => {
    if (latestDonation) {
        res.json({ newSawer: true, data: latestDonation });
        latestDonation = null; // reset setelah diambil
    } else {
        res.json({ newSawer: false });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
