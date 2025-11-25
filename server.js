<<<<<<< HEAD
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 3000;

let latestDonation = null;

app.use(bodyParser.json());

// Route webhook Saweria
app.post("/saweria-webhook", (req, res) => {
    const data = req.body;

    // Debug log payload
    console.log("Webhook received raw data:", data);

    // Sesuaikan dengan payload Saweria
    latestDonation = {
        username: data.user || "Unknown",
        amount: data.value || 0,
        message: data.note || ""
    };

    console.log("New donation:", latestDonation);
    res.sendStatus(200);
});

// Route GET untuk Roblox
app.get("/lastsawer", (req, res) => {
    if (latestDonation) {
        res.json({ newSawer: true, data: latestDonation });
        latestDonation = null;
    } else {
        res.json({ newSawer: false });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
=======
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 3000;

let latestDonation = null;

app.use(bodyParser.json());

app.post("/saweria-webhook", (req, res) => {
    const data = req.body;
    latestDonation = {
        username: data.username,
        amount: data.amount,
        message: data.message
    };
    console.log("New donation:", latestDonation);
    res.sendStatus(200);
});

app.get("/lastsawer", (req, res) => {
    if (latestDonation) {
        res.json({ newSawer: true, data: latestDonation });
        latestDonation = null;
    } else {
        res.json({ newSawer: false });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
>>>>>>> 7b02b108ed5c4d1778fe50ba623b44f45c5b3b7a
