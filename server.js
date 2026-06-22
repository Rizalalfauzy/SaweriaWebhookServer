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
//   ✅ Daily Discord report jam 06:00 WIB
// ============================================================

const EXPIRE_MS       = 5 * 60 * 1000;  // 5 menit
const DEAD_THRESHOLD  = 20 * 1000;       // 20 detik tidak poll = dead
const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1518633050009764093/7lc_EnvnvFRwo-JetinYXN5aDX-weIdW2sf450SAXSW1X9kVJjK15fE8zgUZRq9k62mg";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ============================================================
// STATE
// ============================================================

let donationQueue = [];
const activeServers = new Map();

// Daily report accumulator
// Format: { "username": totalAmount }
let dailyDonations = {};
let dailyTotal     = 0;
let dailyCount     = 0;

// ============================================================
// HELPERS
// ============================================================

function getActiveServerIds() {
    const now = Date.now();
    const alive = [];
    for (const [id, lastSeen] of activeServers.entries()) {
        if (now - lastSeen <= DEAD_THRESHOLD) alive.push(id);
    }
    return alive;
}

function markServerAlive(serverId) {
    if (!serverId) return;
    activeServers.set(serverId, Date.now());
}

function isFullyConfirmed(donation) {
    const aliveIds = getActiveServerIds();
    if (aliveIds.length === 0) return false;
    return aliveIds.every(id => donation.confirmedBy.has(id));
}

function formatRupiah(amount) {
    return "Rp " + amount.toLocaleString("id-ID");
}

// ============================================================
// DISCORD REPORT
// ============================================================

async function sendDiscordReport() {
    const now    = new Date();
    // Tanggal WIB (UTC+7)
    const wib    = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const tgl    = wib.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

    // Sort donor by amount descending
    const sorted = Object.entries(dailyDonations)
        .sort((a, b) => b[1] - a[1]);

    let donorList = "";
    if (sorted.length === 0) {
        donorList = "_Belum ada donasi hari ini_";
    } else {
        sorted.forEach(([name, amount], i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
            donorList += `${medal} **${name}** — ${formatRupiah(amount)}\n`;
        });
    }

    const embed = {
        embeds: [{
            title: `📊 Daily Saweria Report — ${tgl}`,
            color: 0xF97316, // orange
            description: donorList,
            fields: [
                {
                    name: "💰 Total Pemasukan",
                    value: `**${formatRupiah(dailyTotal)}**`,
                    inline: true,
                },
                {
                    name: "🔢 Total Donasi",
                    value: `**${dailyCount}x**`,
                    inline: true,
                },
            ],
            footer: {
                text: "Back 2 Room • Saweria Report",
            },
            timestamp: new Date().toISOString(),
        }]
    };

    try {
        const res = await fetch(DISCORD_WEBHOOK, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(embed),
        });
        if (res.ok) {
            console.log(`[Discord] Report harian terkirim — Total: ${formatRupiah(dailyTotal)} | ${dailyCount} donasi`);
        } else {
            console.error(`[Discord] Gagal kirim report: ${res.status} ${res.statusText}`);
        }
    } catch (err) {
        console.error(`[Discord] Error kirim report:`, err.message);
    }

    // Reset accumulator setelah kirim
    dailyDonations = {};
    dailyTotal     = 0;
    dailyCount     = 0;
}

// ============================================================
// CRON — Cek setiap menit, kirim jam 06:00 WIB (= 23:00 UTC)
// ============================================================
let lastReportDate = null;

setInterval(() => {
    const now = new Date();
    // Konversi ke WIB
    const wib    = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const hour   = wib.getUTCHours();
    const minute = wib.getUTCMinutes();
    const today  = wib.toISOString().slice(0, 10); // "2026-06-22"

    if (hour === 6 && minute === 0 && lastReportDate !== today) {
        lastReportDate = today;
        console.log(`[Cron] Jam 06:00 WIB — kirim daily report`);
        sendDiscordReport();
    }
}, 60 * 1000);

// ============================================================
// CLEANUP — setiap 1 menit
// ============================================================
setInterval(() => {
    const now    = Date.now();
    const before = donationQueue.length;

    donationQueue = donationQueue.filter(d => now < d.expireAt);

    const removed = before - donationQueue.length;
    if (removed > 0) {
        console.log(`[Cleanup] Expired removed: ${removed} | Queue: ${donationQueue.length}`);
    }

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
    res.send("Saweria webhook server running ✅ (Multi-Server Edition + Daily Report)");
});

// ============================================================
// WEBHOOK — Saweria POST ke sini
// ============================================================
app.post("/saweria-webhook", (req, res) => {
    console.log("RAW PAYLOAD:", JSON.stringify(req.body));

    const d = req.body || {};

    const id = d.id
        || (Date.now().toString() + "_" + Math.random().toString(36).slice(2, 8));

    const alreadyQueued = donationQueue.some(item => item.id === id);
    if (alreadyQueued) {
        console.log(`[Duplicate] Ignored: ${id}`);
        return res.status(200).json({ success: true, duplicate: true });
    }

    const amount = parseInt(d.amount_raw) || parseInt(d.amount) || 0;
    if (amount <= 0) {
        console.warn(`[Warning] Amount 0 atau tidak valid untuk id: ${id}`);
    }

    const username = d.donator_name || d.username || d.name || "Guest";

    const entry = {
        id:          id,
        username:    username,
        amount:      amount,
        message:     d.message || "",
        expireAt:    Date.now() + EXPIRE_MS,
        receivedAt:  new Date().toISOString(),
        confirmedBy: new Set(),
    };

    donationQueue.push(entry);

    // ✅ Akumulasi ke daily report (langsung saat donasi masuk, bukan tunggu confirm)
    if (amount > 0) {
        dailyDonations[username] = (dailyDonations[username] || 0) + amount;
        dailyTotal += amount;
        dailyCount += 1;
        console.log(`[Daily] +${formatRupiah(amount)} dari ${username} | Hari ini: ${formatRupiah(dailyTotal)} (${dailyCount}x)`);
    }

    console.log(`[Queued] id=${id} | user=${username} | amount=${amount} | Queue: ${donationQueue.length}`);

    res.status(200).json({ success: true });
});

// ============================================================
// POLLING — Roblox GET ke sini setiap 5 detik
// ============================================================
app.get("/lastsawer", (req, res) => {
    const serverId = req.query.serverId || null;

    if (serverId) markServerAlive(serverId);

    donationQueue = donationQueue.filter(d => Date.now() < d.expireAt);

    if (donationQueue.length > 0) {
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
// ============================================================
app.post("/confirm/:id", (req, res) => {
    const id       = req.params.id;
    const serverId = req.query.serverId || null;

    const donation = donationQueue.find(d => d.id === id);

    if (!donation) {
        console.log(`[Confirm] id=${id} tidak ditemukan (sudah expired atau double confirm)`);
        return res.json({ success: true, removed: 0 });
    }

    if (serverId) {
        donation.confirmedBy.add(serverId);
        console.log(`[Confirm] id=${id} | serverId=${serverId} | confirmedBy: [${[...donation.confirmedBy].join(", ")}]`);
    }

    const aliveIds     = getActiveServerIds();
    const allConfirmed = isFullyConfirmed(donation);

    console.log(`[Confirm] Active servers: [${aliveIds.join(", ")}] | All confirmed: ${allConfirmed}`);

    if (allConfirmed) {
        donationQueue = donationQueue.filter(d => d.id !== id);
        console.log(`[Confirm] FULLY CONFIRMED — id=${id} dihapus | Queue: ${donationQueue.length}`);
        return res.json({ success: true, removed: 1, status: "fully_confirmed" });
    }

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
        dailyReport: {
            total:     dailyTotal,
            count:     dailyCount,
            donations: dailyDonations,
        },
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
// REPORT MANUAL — trigger report sekarang tanpa nunggu jam 06:00
// POST /report-now
// ============================================================
app.post("/report-now", (req, res) => {
    console.log(`[Report] Manual trigger report`);
    sendDiscordReport();
    res.json({ success: true, message: "Report dikirim ke Discord" });
});

// ============================================================
app.listen(PORT, () => console.log(`Saweria webhook server running on port ${PORT} (Multi-Server Edition + Daily Report)`));
