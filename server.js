const express = require("express");
const cors    = require("cors");
const app     = express();
const PORT    = process.env.PORT || 3000;

// ============================================================
//   🪝 SAWERIA WEBHOOK SERVER — Multi-Server Edition
//   ✅ FIFO queue
//   ✅ Dedup by ID
//   ✅ Multi-server tracking — tiap server punya confirm sendiri
//   ✅ Donasi dihapus hanya kalau SEMUA server aktif sudah confirm
//   ✅ Server dianggap "dead" kalau tidak poll > DEAD_THRESHOLD ms
//   ✅ Auto-expire 5 menit
//   ✅ /status, /clear endpoint
// ============================================================

const EXPIRE_MS       = 5 * 60 * 1000;  // 5 menit
const DEAD_THRESHOLD  = 20 * 1000;       // 20 detik tidak poll = dead

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ============================================================
// STATE
// ============================================================

// donationQueue: array of {
//   id, username, amount, message, expireAt, receivedAt,
//   confirmedBy: Set<serverId>   ← server mana saja yang sudah confirm
// }
let donationQueue = [];

// activeServers: Map<serverId, lastSeenAt (timestamp)>
const activeServers = new Map();

// ============================================================
// HELPERS
// ============================================================

function getActiveServerIds() {
    const now = Date.now();
    const alive = [];
    for (const [id, lastSeen] of activeServers.entries()) {
        if (now - lastSeen <= DEAD_THRESHOLD) {
            alive.push(id);
        }
    }
    return alive;
}

function markServerAlive(serverId) {
    if (!serverId) return;
    activeServers.set(serverId, Date.now());
}

// Cek apakah donasi sudah di-confirm oleh semua server aktif
function isFullyConfirmed(donation) {
    const aliveIds = getActiveServerIds();
    if (aliveIds.length === 0) return false; // jangan hapus kalau tidak ada server aktif
    return aliveIds.every(id => donation.confirmedBy.has(id));
}

// ============================================================
// CLEANUP — setiap 1 menit
// ============================================================
setInterval(() => {
    const now    = Date.now();
    const before = donationQueue.length;

    // Hapus expired
    donationQueue = donationQueue.filter(d => now < d.expireAt);

    const removed = before - donationQueue.length;
    if (removed > 0) {
        console.log(`[Cleanup] Expired removed: ${removed} | Queue: ${donationQueue.length}`);
    }

    // Log dead servers
    for (const [id, lastSeen] of activeServers.entries()) {
        if (now - lastSeen > DEAD_THRESHOLD) {
            console.log(`[Server] Dead: ${id} (last seen ${Math.round((now - lastSeen) / 1000)}s ago)`);
        }
    }
}, 60 * 1000);

// ============================================================
// ROOT
// ============================================================
app.get("/", (req, res) => {
    res.send("Saweria webhook server running ✅ (Multi-Server Edition)");
});

// ============================================================
// WEBHOOK — Saweria POST ke sini
// ============================================================
app.post("/saweria-webhook", (req, res) => {
    console.log("RAW PAYLOAD:", JSON.stringify(req.body));

    const d = req.body || {};

    const id = d.id
        || (Date.now().toString() + "_" + Math.random().toString(36).slice(2, 8));

    // Cek duplikat
    const alreadyQueued = donationQueue.some(item => item.id === id);
    if (alreadyQueued) {
        console.log(`[Duplicate] Ignored: ${id}`);
        return res.status(200).json({ success: true, duplicate: true });
    }

    const amount = parseInt(d.amount_raw) || parseInt(d.amount) || 0;
    if (amount <= 0) {
        console.warn(`[Warning] Amount 0 atau tidak valid untuk id: ${id}`);
    }

    const entry = {
        id:          id,
        username:    d.donator_name || d.username || d.name || "Guest",
        amount:      amount,
        message:     d.message || "",
        expireAt:    Date.now() + EXPIRE_MS,
        receivedAt:  new Date().toISOString(),
        confirmedBy: new Set(),  // ← track per-server confirm
    };

    donationQueue.push(entry);
    console.log(`[Queued] id=${id} | user=${entry.username} | amount=${entry.amount} | Queue: ${donationQueue.length}`);

    res.status(200).json({ success: true });
});

// ============================================================
// POLLING — Roblox GET ke sini setiap 5 detik
// Query param: ?serverId=<jobId>
// ============================================================
app.get("/lastsawer", (req, res) => {
    const serverId = req.query.serverId || null;

    // Tandai server ini masih hidup
    if (serverId) {
        markServerAlive(serverId);
    }

    // Buang yang expired
    donationQueue = donationQueue.filter(d => Date.now() < d.expireAt);

    if (donationQueue.length > 0) {
        // Cari donasi pertama yang belum di-confirm oleh server ini
        const next = serverId
            ? donationQueue.find(d => !d.confirmedBy.has(serverId))
            : donationQueue[0];

        if (next) {
            console.log(`[Poll] serverId=${serverId} | Serving: id=${next.id} | user=${next.username} | amount=${next.amount}`);
            return res.json({
                newSawer: true,
                data: {
                    id:       next.id,
                    username: next.username,
                    amount:   next.amount,
                    message:  next.message,
                }
            });
        }
    }

    res.json({ newSawer: false });
});

// ============================================================
// CONFIRM — Roblox POST setelah berhasil proses donasi
// Route: /confirm/:id?serverId=<jobId>
// ============================================================
app.post("/confirm/:id", (req, res) => {
    const id       = req.params.id;
    const serverId = req.query.serverId || null;

    const donation = donationQueue.find(d => d.id === id);

    if (!donation) {
        console.log(`[Confirm] id=${id} tidak ditemukan (sudah expired atau double confirm)`);
        return res.json({ success: true, removed: 0 });
    }

    // Catat bahwa server ini sudah confirm
    if (serverId) {
        donation.confirmedBy.add(serverId);
        console.log(`[Confirm] id=${id} | serverId=${serverId} | confirmedBy: [${[...donation.confirmedBy].join(", ")}]`);
    }

    // Cek apakah semua server aktif sudah confirm
    const aliveIds   = getActiveServerIds();
    const allConfirmed = isFullyConfirmed(donation);

    console.log(`[Confirm] Active servers: [${aliveIds.join(", ")}] | All confirmed: ${allConfirmed}`);

    if (allConfirmed) {
        donationQueue = donationQueue.filter(d => d.id !== id);
        console.log(`[Confirm] FULLY CONFIRMED — id=${id} dihapus | Queue: ${donationQueue.length}`);
        return res.json({ success: true, removed: 1, status: "fully_confirmed" });
    }

    // Belum semua confirm, tunggu server lain
    const pending = aliveIds.filter(sid => !donation.confirmedBy.has(sid));
    res.json({ success: true, removed: 0, status: "waiting", pendingServers: pending });
});

// ============================================================
// STATUS — debug
// ============================================================
app.get("/status", (req, res) => {
    const now      = Date.now();
    const aliveIds = getActiveServerIds();

    res.json({
        queueSize:     donationQueue.length,
        serverTime:    new Date().toISOString(),
        activeServers: aliveIds,
        allServers: [...activeServers.entries()].map(([id, lastSeen]) => ({
            id,
            lastSeenAgo: Math.round((now - lastSeen) / 1000) + "s",
            alive: now - lastSeen <= DEAD_THRESHOLD,
        })),
        queue: donationQueue.map(d => ({
            id:          d.id,
            username:    d.username,
            amount:      d.amount,
            message:     d.message,
            receivedAt:  d.receivedAt,
            expiresIn:   Math.round((d.expireAt - now) / 1000) + "s",
            confirmedBy: [...d.confirmedBy],
            pendingFrom: aliveIds.filter(sid => !d.confirmedBy.has(sid)),
        })),
    });
});

// ============================================================
// CLEAR — reset manual
// ============================================================
app.post("/clear", (req, res) => {
    const count   = donationQueue.length;
    donationQueue = [];
    activeServers.clear();
    console.log(`[Clear] Manual clear: ${count} donations + all server tracking removed`);
    res.json({ success: true, cleared: count });
});

// ============================================================
app.listen(PORT, () => console.log(`Saweria webhook server running on port ${PORT} (Multi-Server Edition)`));
