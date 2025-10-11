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
