import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
    res.json({ status: "OK", message: "Saweria Webhook Server Online" });
});

// Webhook endpoint
app.post("/saweria-webhook", (req, res) => {
    console.log("===== NEW WEBHOOK CALL =====");

    // Data ORIGINAL dari request body
    const body = req.body;
    console.log("RAW BODY:", body);

    // Validasi format
    if (!body || !body.data) {
        console.log("❌ Invalid payload, missing body.data");
        return res.status(200).json({ ok: true });
    }

    const donation = {
        username: body.data.username || "Unknown",
        amount: body.data.amount || 0,
        message: body.data.message || "",
    };

    console.log("PARSED DONATION:", donation);

    // Kirim response ke Roblox
    res.json(donation);
});

app.listen(PORT, () => {
    console.log(`SAWERIA WEBHOOK SERVER RUNNING ON PORT ${PORT}`);
});
