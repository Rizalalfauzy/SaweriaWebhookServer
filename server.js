// server.js
const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

let latestDonation = null;

// Middleware
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Root untuk cek server
app.get("/", (req, res) => {
    res.send("Saweria webhook server is running");
});

// Endpoint webhook Saweria
app.post("/saweria-webhook", (req, res) => {
    console.log("PAYLOAD RECEIVED:", req.body);

    const data = req.body || {};

    latestDonation = {
        username: (data.name && data.name !== "") ? data.name : "Someone",
        amount: (data.value != null) ? data.value : 0,
        message: data.message || ""
    };

    console.log("New donation stored:", latestDonation);
    res.status(200).json({ success: true });
});

// Endpoint diambil Roblox
app.get("/lastsawer", (req, res) => {
    if (latestDonation) {
        const sendData = { newSawer: true, data: latestDonation };
        latestDonation = null; // reset setelah dikirim
        res.json(sendData);
    } else {
        res.json({ newSawer: false });
    }
});

app.listen(PORT, () => console.log(`Saweria webhook server running on port ${PORT}`));
