// ============================================
// TRADE INFINITY BOT v3 — ALL FIXES APPLIED
// ============================================
// Fixes:
// - /link works even when re-linking to a new email
// - Old email gets unlinked automatically
// - /reset command added to unlink account
// - Every command wrapped in try-catch (no silent crashes)
// - Bot recovers from deleted chats
// - Detailed console logs for debugging

const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const cron = require("node-cron");
const express = require("express");

// ─── CONFIG ───
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "ti_admin_2026";
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error("FATAL: TELEGRAM_BOT_TOKEN is missing in Environment variables!");
  process.exit(1);
}

console.log("Starting Trade Infinity Bot v3...");
console.log("BOT_TOKEN: set (" + BOT_TOKEN.substring(0, 8) + "...)");
console.log("SUPABASE_URL:", SUPABASE_URL ? "set" : "MISSING");
console.log("SUPABASE_KEY:", SUPABASE_KEY ? "set (" + SUPABASE_KEY.substring(0, 10) + "...)" : "MISSING");

// ─── INIT BOT ───
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("Telegram bot connected!");

// ─── INIT SUPABASE ───
let supabase = null;
let dbOk = false;

if (SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.startsWith("http")) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  dbOk = true;
  console.log("Supabase initialized!");
} else {
  console.log("WARNING: Supabase not configured. Commands that need database won't work.");
}

// ─── EXPRESS (keeps bot alive on Render) ───
const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "running", version: "v3", database: dbOk, uptime: Math.floor(process.uptime()) + "s" });
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
  console.log("============ BOT READY ============");
});

// ─── ERROR HANDLERS (prevent crashes) ───
bot.on("polling_error", (err) => {
  console.log("Polling error:", err.code, "-", err.message);
});

bot.on("error", (err) => {
  console.log("Bot error:", err.message);
});

process.on("uncaughtException", (err) => {
  console.log("Uncaught exception:", err.message);
});

process.on("unhandledRejection", (err) => {
  console.log("Unhandled rejection:", err);
});

// ─── HELPER: Safe send message ───
async function safeSend(chatId, text, options = {}) {
  try {
    await bot.sendMessage(chatId, text, options);
    return true;
  } catch (err) {
    console.log("Failed to send message to " + chatId + ":", err.message);
    return false;
  }
}

// ─── HELPER: Check DB ───
async function checkDb() {
  if (!dbOk || !supabase) return false;
  try {
    const { error } = await supabase.from("users").select("id").limit(1);
    return !error;
  } catch (e) {
    return false;
  }
}

// ============================================
// COMMAND: /start
// ============================================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "Trader";
  console.log("/start from " + name + " (chat:" + chatId + ")");

  await safeSend(chatId,
    "🟢 *Welcome to Trade Infinity, " + name + "!*\n\n" +
    "I send real-time alerts when Nifty 100 stocks hit their 52-week high on NSE.\n\n" +
    "📊 *Strategy:* 52-Week High Breakout\n" +
    "🎯 Target: +30% | 🛡️ SL: -15%\n" +
    "🇮🇳 Market: NSE Nifty 100\n\n" +
    "*Commands:*\n" +
    "/link your@email.com — Connect your account\n" +
    "/status — Check your plan\n" +
    "/lastalert — Last trade alert\n" +
    "/reset — Unlink your account\n" +
    "/test — Check bot health\n" +
    "/help — Show all commands\n\n" +
    "👉 *Step 1:* Sign up at our website\n" +
    "👉 *Step 2:* Come back here and type /link your@email.com",
    { parse_mode: "Markdown" }
  );
});

// ============================================
// COMMAND: /help
// ============================================
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  console.log("/help from chat:" + chatId);

  await safeSend(chatId,
    "📖 *Trade Infinity Bot — Help*\n\n" +
    "*Commands:*\n" +
    "/start — Welcome & setup\n" +
    "/link your@email.com — Connect account\n" +
    "/status — Check your plan & trial days\n" +
    "/lastalert — See last trade alert\n" +
    "/reset — Unlink & re-link another email\n" +
    "/test — Bot health check\n" +
    "/help — This message\n\n" +
    "*Alerts:* Mon-Fri at 10 AM, 1 PM, 3:15 PM IST\n\n" +
    "📱 WhatsApp: +91 78691 43383\n" +
    "📧 tradeinfinity1410@gmail.com",
    { parse_mode: "Markdown" }
  );
});

// ============================================
// COMMAND: /test
// ============================================
bot.onText(/\/test/, async (msg) => {
  const chatId = msg.chat.id;
  console.log("/test from chat:" + chatId);

  let dbStatus = "Not configured";
  if (dbOk) {
    const works = await checkDb();
    dbStatus = works ? "Connected & working" : "Error connecting";
  }

  await safeSend(chatId,
    "🔧 *Bot Health Check*\n\n" +
    "🤖 Bot: Running\n" +
    "💬 Your Chat ID: " + chatId + "\n" +
    "🗄️ Database: " + dbStatus + "\n" +
    "⏰ " + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + "\n" +
    "📦 Version: v3",
    { parse_mode: "Markdown" }
  );
});

// ============================================
// COMMAND: /link email — Connect account
// ============================================
bot.onText(/\/link (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const email = match[1].trim().toLowerCase();
  console.log("/link " + email + " from chat:" + chatId);

  // Validate email
  if (!email.includes("@") || !email.includes(".") || email.includes(" ")) {
    await safeSend(chatId, "❌ That doesn't look like a valid email.\n\nType it like this:\n/link yourname@gmail.com");
    return;
  }

  // Check database
  if (!dbOk) {
    await safeSend(chatId,
      "📧 Got your email: *" + email + "*\n\n" +
      "⚠️ Database is being set up. Contact us:\n📱 WhatsApp: +91 78691 43383",
      { parse_mode: "Markdown" }
    );
    return;
  }

  try {
    // STEP 1: Unlink any PREVIOUS account connected to this chat ID
    // This fixes the "can't re-link" problem
    const { data: oldUsers } = await supabase
      .from("users")
      .select("id, email")
      .eq("telegram_chat_id", chatId);

    if (oldUsers && oldUsers.length > 0) {
      for (const old of oldUsers) {
        if (old.email !== email) {
          console.log("Unlinking old account " + old.email + " from chat " + chatId);
          await supabase
            .from("users")
            .update({ telegram_chat_id: null, telegram_connected: false })
            .eq("id", old.id);
        }
      }
    }

    // STEP 2: Find the new account
    const { data: users, error: findErr } = await supabase
      .from("users")
      .select("*")
      .eq("email", email);

    if (findErr) {
      console.log("DB error finding user:", findErr.message);
      await safeSend(chatId, "⚠️ Database error. Please try again in a minute.\n\nIf it keeps failing, WhatsApp: +91 78691 43383");
      return;
    }

    if (!users || users.length === 0) {
      await safeSend(chatId,
        "❌ No account found for *" + email + "*\n\n" +
        "Make sure you've signed up on our website first with this exact email, then try /link again.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const user = users[0];

    // STEP 3: Link this chat to the new account
    const { error: updateErr } = await supabase
      .from("users")
      .update({ telegram_chat_id: chatId, telegram_connected: true })
      .eq("id", user.id);

    if (updateErr) {
      console.log("DB error updating user:", updateErr.message);
      await safeSend(chatId, "⚠️ Error linking. Try again.\n📱 WhatsApp: +91 78691 43383");
      return;
    }

    // STEP 4: Tell the user it worked
    let planLabel = "FREE";
    if (user.plan === "pro") planLabel = "PRO ✨";
    else if (user.plan === "trial") {
      const daysLeft = Math.max(0, Math.ceil((new Date(user.trial_end) - new Date()) / 86400000));
      planLabel = daysLeft > 0 ? "TRIAL (" + daysLeft + " days left)" : "TRIAL (expired)";
    }

    await safeSend(chatId,
      "✅ *Account linked successfully!*\n\n" +
      "📧 Email: " + email + "\n" +
      "📦 Plan: " + planLabel + "\n\n" +
      "You'll now receive alerts when Nifty 100 stocks hit 52-week highs!\n\n" +
      "Use /status to check anytime.",
      { parse_mode: "Markdown" }
    );

    console.log("Successfully linked " + email + " to chat " + chatId);

  } catch (err) {
    console.log("/link error:", err.message);
    await safeSend(chatId, "⚠️ Something went wrong. Try again.\n📱 WhatsApp: +91 78691 43383");
  }
});

// ============================================
// COMMAND: /reset — Unlink account
// ============================================
bot.onText(/\/reset/, async (msg) => {
  const chatId = msg.chat.id;
  console.log("/reset from chat:" + chatId);

  if (!dbOk) {
    await safeSend(chatId, "Database not connected. Nothing to reset.");
    return;
  }

  try {
    const { data: users } = await supabase
      .from("users")
      .select("id, email")
      .eq("telegram_chat_id", chatId);

    if (!users || users.length === 0) {
      await safeSend(chatId, "No account is linked to this Telegram. Nothing to reset.\n\nUse /link your@email.com to connect.");
      return;
    }

    for (const user of users) {
      await supabase
        .from("users")
        .update({ telegram_chat_id: null, telegram_connected: false })
        .eq("id", user.id);
    }

    await safeSend(chatId,
      "🔄 *Account unlinked!*\n\n" +
      "You can now link a different account:\n/link newemail@gmail.com",
      { parse_mode: "Markdown" }
    );

    console.log("Reset/unlinked chat " + chatId);
  } catch (err) {
    console.log("/reset error:", err.message);
    await safeSend(chatId, "⚠️ Error. Try again.");
  }
});

// ============================================
// COMMAND: /status
// ============================================
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  console.log("/status from chat:" + chatId);

  if (!dbOk) {
    await safeSend(chatId, "⚠️ Database being set up.\n📱 WhatsApp: +91 78691 43383");
    return;
  }

  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_chat_id", chatId);

    if (error || !users || users.length === 0) {
      await safeSend(chatId,
        "❌ No account linked to this Telegram.\n\nUse /link your@email.com to connect."
      );
      return;
    }

    const user = users[0];
    let planText = "";

    if (user.plan === "pro") {
      planText = "✨ *PRO* — Unlimited alerts";
    } else if (user.plan === "trial") {
      const daysLeft = Math.max(0, Math.ceil((new Date(user.trial_end) - new Date()) / 86400000));
      if (daysLeft > 0) {
        planText = "🟡 *TRIAL* — " + daysLeft + " days left";
      } else {
        planText = "🔴 *TRIAL EXPIRED* — Upgrade to Pro on website";
      }
    } else {
      planText = "⚪ *FREE* — Start trial on website";
    }

    await safeSend(chatId,
      "📊 *Your Status*\n\n" +
      "📧 " + user.email + "\n" +
      "📦 " + planText + "\n" +
      "🔗 Telegram: Linked ✅\n\n" +
      "📱 Help: +91 78691 43383",
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    console.log("/status error:", err.message);
    await safeSend(chatId, "⚠️ Error. Try again.");
  }
});

// ============================================
// COMMAND: /lastalert
// ============================================
bot.onText(/\/lastalert/, async (msg) => {
  const chatId = msg.chat.id;
  console.log("/lastalert from chat:" + chatId);

  if (!dbOk) {
    await safeSend(chatId, "📭 No alerts yet. System being set up.");
    return;
  }

  try {
    const { data, error } = await supabase
      .from("alerts_log")
      .select("*")
      .order("triggered_at", { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      await safeSend(chatId, "📭 No alerts have been sent yet.\n\nAlerts come during market hours: Mon-Fri, 10 AM — 3:30 PM IST.");
      return;
    }

    await safeSend(chatId, formatAlert(data[0]), { parse_mode: "Markdown" });
  } catch (err) {
    console.log("/lastalert error:", err.message);
    await safeSend(chatId, "⚠️ Error fetching alert. Try again.");
  }
});

// ============================================
// HANDLE: Any other message
// ============================================
bot.on("message", async (msg) => {
  try {
    const text = (msg.text || "").trim();
    const chatId = msg.chat.id;

    // Skip commands (already handled above)
    if (text.startsWith("/")) return;

    // If it looks like an email, help them
    if (text.includes("@") && text.includes(".") && !text.includes(" ")) {
      await safeSend(chatId, "Want to link this email? Use:\n\n/link " + text);
      return;
    }

    // Any other message
    if (text.length > 0) {
      await safeSend(chatId, "👋 Hey! I'm the Trade Infinity Bot.\n\nType /help to see what I can do.");
    }
  } catch (err) {
    // Silently ignore
  }
});

// ============================================
// ALERT SYSTEM
// ============================================
function formatAlert(a) {
  return (
    "🟢 *TRADE ALERT*\n" +
    "━━━━━━━━━━━━━━━━━━\n\n" +
    "📊 *" + a.stock_name + "*\n" +
    "Strategy: 52-Week High Breakout\n\n" +
    "💰 Entry: ₹" + Number(a.entry_price).toLocaleString("en-IN") + "\n" +
    "🎯 Target (+30%): ₹" + Number(a.target_price).toLocaleString("en-IN") + "\n" +
    "🛡️ SL (-15%): ₹" + Number(a.sl_price).toLocaleString("en-IN") + "\n\n" +
    "📈 Risk:Reward = 1:2\n" +
    "🇮🇳 NSE\n" +
    "⏰ " + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + "\n\n" +
    "_Not SEBI registered. Trade at own risk._"
  );
}

async function sendAlertToUsers(alertData) {
  if (!dbOk) return 0;

  try {
    const { data: users } = await supabase
      .from("users")
      .select("*")
      .eq("telegram_connected", true)
      .not("telegram_chat_id", "is", null);

    if (!users || users.length === 0) return 0;

    let count = 0;
    const msg = formatAlert(alertData);
    const now = new Date();

    for (const u of users) {
      let hasAccess = false;
      if (u.plan === "pro") hasAccess = true;
      else if (u.plan === "trial" && u.trial_end) hasAccess = now < new Date(u.trial_end);

      if (hasAccess && u.telegram_chat_id) {
        const sent = await safeSend(u.telegram_chat_id, msg, { parse_mode: "Markdown" });
        if (sent) count++;
        await new Promise(r => setTimeout(r, 200));
      }
    }
    return count;
  } catch (err) {
    console.log("sendAlertToUsers error:", err.message);
    return 0;
  }
}

// ============================================
// SCHEDULED SCANS — Mon-Fri during market hours
// ============================================
async function runScan() {
  console.log("--- SCAN at " + new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " ---");
  try {
    const res = await fetch("https://www.nseindia.com/api/live-analysis-52Week-high", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://www.nseindia.com/",
      },
    });
    if (!res.ok) { console.log("NSE API status:", res.status); return; }
    const d = await res.json();
    const nifty100 = ["RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK","SBIN","BHARTIARTL","BAJFINANCE","ITC","KOTAKBANK","LT","HCLTECH","AXISBANK","MARUTI","SUNPHARMA","TATAMOTORS","TITAN","NTPC","POWERGRID","M&M","JSWSTEEL","ADANIPORTS","COALINDIA","HAL","BEL","TRENT","ZOMATO","IRFC","SIEMENS","ABB","BAJAJ-AUTO","EICHERMOT","CIPLA","DRREDDY","DIVISLAB","APOLLOHOSP","WIPRO","TECHM","TATASTEEL","HINDALCO","ONGC","BPCL","SBILIFE","HDFCLIFE","NESTLEIND","BRITANNIA","GRASIM","ULTRACEMCO","DMART","INDUSINDBK","SHRIRAMFIN","TATACONSUM","ASIANPAINT","HEROMOTOCO","HINDUNILVR","BAJAJFINSV"];
    if (d.data) {
      for (const s of d.data) {
        if (nifty100.includes(s.symbol)) {
          const p = parseFloat((s.ltp || "0").toString().replace(/,/g, ""));
          if (p > 0) {
            const ad = { stock_name: s.symbol, entry_price: p, target_price: Math.round(p * 1.3 * 100) / 100, sl_price: Math.round(p * 0.85 * 100) / 100 };
            if (dbOk) await supabase.from("alerts_log").insert({ ...ad, strategy: "52-Week High Breakout" });
            const n = await sendAlertToUsers(ad);
            console.log("Alert: " + s.symbol + " → " + n + " users");
          }
        }
      }
    }
  } catch (e) { console.log("Scan error:", e.message); }
}

cron.schedule("0 10 * * 1-5", runScan, { timezone: "Asia/Kolkata" });
cron.schedule("0 13 * * 1-5", runScan, { timezone: "Asia/Kolkata" });
cron.schedule("15 15 * * 1-5", runScan, { timezone: "Asia/Kolkata" });

// Midnight: expire trials
cron.schedule("0 0 * * *", async () => {
  if (!dbOk) return;
  try {
    const { data } = await supabase.from("users").update({ plan: "free" }).eq("plan", "trial").lt("trial_end", new Date().toISOString()).select();
    if (data && data.length > 0) {
      console.log(data.length + " trial(s) expired");
      for (const u of data) {
        if (u.telegram_chat_id && u.telegram_connected) {
          await safeSend(u.telegram_chat_id, "⏰ *Trial ended.* Upgrade to Pro (₹499/mo) on our website.\n📱 Help: +91 78691 43383", { parse_mode: "Markdown" });
        }
      }
    }
  } catch (e) { console.log("Trial check error:", e.message); }
}, { timezone: "Asia/Kolkata" });

// ============================================
// API ENDPOINTS
// ============================================
app.post("/api/register", async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: "DB not ready" });
  try {
    const { email, name, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email & password required" });
    const te = new Date(); te.setDate(te.getDate() + 7);
    const { data, error } = await supabase.from("users").insert({ email: email.toLowerCase().trim(), name: name || "Trader", password_hash: password, plan: "trial", trial_start: new Date().toISOString(), trial_end: te.toISOString() }).select().single();
    if (error) return res.status(error.code === "23505" ? 400 : 500).json({ error: error.code === "23505" ? "Email exists" : error.message });
    res.json({ success: true, plan: "trial", trial_end: te.toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/login", async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: "DB not ready" });
  try {
    const { email, password } = req.body;
    const { data: users } = await supabase.from("users").select("*").eq("email", email.toLowerCase().trim()).eq("password_hash", password);
    if (!users || users.length === 0) return res.status(401).json({ error: "Invalid credentials" });
    const u = users[0];
    let plan = u.plan;
    if (plan === "trial" && u.trial_end && new Date() > new Date(u.trial_end)) { plan = "free"; await supabase.from("users").update({ plan: "free" }).eq("id", u.id); }
    res.json({ success: true, user: { email: u.email, name: u.name, plan, trial_end: u.trial_end, telegram_connected: u.telegram_connected } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/activate-pro", async (req, res) => {
  if (!dbOk) return res.status(503).json({ error: "DB not ready" });
  try {
    const { email } = req.body;
    const { data, error } = await supabase.from("users").update({ plan: "pro", pro_start: new Date().toISOString() }).eq("email", email.toLowerCase().trim()).select().single();
    if (error || !data) return res.status(500).json({ error: "Failed" });
    if (data.telegram_chat_id) await safeSend(data.telegram_chat_id, "✨ *PRO PLAN ACTIVATED!* Unlimited alerts!", { parse_mode: "Markdown" });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Manual alert page (for admin — just open in browser)
app.get("/api/send-alert", async (req, res) => {
  const { stock, entry, key } = req.query;
  if (key !== ADMIN_KEY) return res.send("<html><body style='font-family:sans-serif;padding:40px;background:#111;color:#eee'><h2>Wrong admin key</h2><p>Use: /api/send-alert?key=YOUR_ADMIN_KEY</p></body></html>");
  if (!stock || !entry) return res.send(
    "<html><body style='font-family:sans-serif;padding:40px;max-width:500px;margin:0 auto;background:#111;color:#eee'>" +
    "<h2>📤 Send Manual Alert</h2>" +
    "<form method='GET'><input type='hidden' name='key' value='" + key + "'>" +
    "<p>Stock Symbol:</p><input name='stock' style='padding:10px;width:100%;border-radius:8px;border:1px solid #333;background:#222;color:#eee' placeholder='e.g. RELIANCE' required>" +
    "<p style='margin-top:12px'>Entry Price (₹):</p><input name='entry' type='number' step='0.01' style='padding:10px;width:100%;border-radius:8px;border:1px solid #333;background:#222;color:#eee' placeholder='e.g. 2950' required>" +
    "<br><br><button style='padding:14px 30px;background:#00e89d;color:#000;border:none;border-radius:8px;font-weight:bold;font-size:16px;cursor:pointer;width:100%'>📤 Send Alert to All Users</button></form></body></html>"
  );
  const ep = parseFloat(entry);
  const ad = { stock_name: stock.toUpperCase(), entry_price: ep, target_price: Math.round(ep * 1.3 * 100) / 100, sl_price: Math.round(ep * 0.85 * 100) / 100 };
  if (dbOk) await supabase.from("alerts_log").insert({ ...ad, strategy: "52-Week High Breakout" });
  const n = await sendAlertToUsers(ad);
  res.send("<html><body style='font-family:sans-serif;padding:40px;background:#111;color:#eee'><h2>✅ Alert Sent!</h2><p>Stock: " + ad.stock_name + "</p><p>Entry: ₹" + ad.entry_price + "</p><p>Target: ₹" + ad.target_price + "</p><p>SL: ₹" + ad.sl_price + "</p><p>Sent to: <strong>" + n + " users</strong></p><br><a href='/api/send-alert?key=" + key + "' style='color:#00e89d'>← Send Another</a></body></html>");
});

console.log("All commands registered. Bot v3 ready!");
