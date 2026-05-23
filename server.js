const express = require("express");
const cors    = require("cors");
const app     = express();
const PORT    = process.env.PORT || 3000;

// ============================================================
//   🪝 SAWERIA WEBHOOK SERVER — Railway Edition
//   ✅ Proper FIFO queue (bukan single latestDonation)
//   ✅ Dedup by ID (tidak proses donasi sama 2x)
//   ✅ Confirm endpoint (Roblox konfirmasi setelah berhasil proses)
//   ✅ Auto-expire 5 menit (sinkron dengan SaweriaHandler Roblox)
//   ✅ /status endpoint untuk debug
//   ✅ /clear endpoint untuk reset manual
// ============================================================

const EXPIRE_MS = 5 * 60 * 1000; // 5 menit

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ============================================================
// IN-MEMORY QUEUE (aman di Railway karena proses persistent)
// ============================================================
let donationQueue = [];

// Cleanup otomatis setiap 1 menit — buang yang expired
setInterval(() => {
    const before = donationQueue.length;
    donationQueue = donationQueue.filter(d => Date.now() < d.expireAt);
    const removed = before - donationQueue.length;
    if (removed > 0) {
        console.log(`[Cleanup] Removed ${removed} expired | Queue: ${donationQueue.length}`);
    }
}, 60 * 1000);

// ============================================================
// ROOT
// ============================================================
app.get("/", (req, res) => {
    res.send("Saweria webhook server running ✅ (Railway Edition)");
});

// ============================================================
// WEBHOOK — Saweria POST ke sini
// ============================================================
app.post("/saweria-webhook", (req, res) => {
    console.log("RAW PAYLOAD:", JSON.stringify(req.body));

    const d = req.body || {};

    // Generate ID unik kalau tidak ada dari Saweria
    const id = d.id
        || (Date.now().toString() + "_" + Math.random().toString(36).slice(2, 8));

    // Cek duplikat sebelum push
    const alreadyQueued = donationQueue.some(item => item.id === id);
    if (alreadyQueued) {
        console.log(`[Duplicate] Ignored: ${id}`);
        return res.status(200).json({ success: true, duplicate: true });
    }

    // Handle berbagai format amount dari Saweria
    const amount = parseInt(d.amount_raw) || parseInt(d.amount) || 0;
    if (amount <= 0) {
        console.warn(`[Warning] Amount 0 atau tidak valid untuk id: ${id}`);
    }

    const entry = {
        id:         id,
        username:   d.donator_name || d.username || d.name || "Guest",
        amount:     amount,
        message:    d.message || "",
        expireAt:   Date.now() + EXPIRE_MS,
        receivedAt: new Date().toISOString(),
    };

    donationQueue.push(entry);
    console.log(`[Queued] id=${id} | user=${entry.username} | amount=${entry.amount} | Queue: ${donationQueue.length}`);

    res.status(200).json({ success: true });
});

// ============================================================
// POLLING — Roblox GET ke sini setiap 5 detik
// ============================================================
app.get("/lastsawer", (req, res) => {
    // Buang yang expired dulu
    donationQueue = donationQueue.filter(d => Date.now() < d.expireAt);

    if (donationQueue.length > 0) {
        // Ambil paling lama (FIFO) — jangan hapus, tunggu confirm dari Roblox
        const next = donationQueue[0];

        console.log(`[Poll] Serving: id=${next.id} | user=${next.username} | amount=${next.amount} | Queue: ${donationQueue.length}`);

        res.json({
            newSawer: true,
            data: {
                id:       next.id,
                username: next.username,
                amount:   next.amount,
                message:  next.message,
            }
        });
    } else {
        res.json({ newSawer: false });
    }
});

// ============================================================
// CONFIRM — Roblox POST ke sini setelah berhasil proses donasi
// ============================================================
app.post("/confirm/:id", (req, res) => {
    const id     = req.params.id;
    const before = donationQueue.length;

    donationQueue = donationQueue.filter(d => d.id !== id);

    const removed = before - donationQueue.length;
    if (removed > 0) {
        console.log(`[Confirmed] id=${id} | Removed: ${removed} | Queue: ${donationQueue.length}`);
    } else {
        console.log(`[Confirm] id=${id} tidak ditemukan (mungkin sudah expired atau double confirm)`);
    }

    res.json({ success: true, removed });
});

// ============================================================
// STATUS — debug manual, cek isi queue sekarang
// ============================================================
app.get("/status", (req, res) => {
    const now = Date.now();
    res.json({
        queueSize:  donationQueue.length,
        serverTime: new Date().toISOString(),
        queue: donationQueue.map(d => ({
            id:         d.id,
            username:   d.username,
            amount:     d.amount,
            message:    d.message,
            receivedAt: d.receivedAt,
            expiresIn:  Math.round((d.expireAt - now) / 1000) + "s",
        })),
    });
});

// ============================================================
// CLEAR — reset manual kalau queue stuck
// ============================================================
app.post("/clear", (req, res) => {
    const count = donationQueue.length;
    donationQueue = [];
    console.log(`[Clear] Manual clear: ${count} donations removed`);
    res.json({ success: true, cleared: count });
});

// ============================================================
app.listen(PORT, () => console.log(`Saweria webhook server running on port ${PORT}`));
