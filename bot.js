// ============================================
// TRADE INFINITY — TELEGRAM BOT + ALERT ENGINE
// ============================================
// This is the main file that:
// 1. Runs the Telegram bot (responds to user messages)
// 2. Scans for 52-week highs every day at market hours
// 3. Sends alerts to trial & pro users
// 4. Manages subscriptions (trial expiry, etc.)

const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const cron = require("node-cron");
const express = require("express");
const { scanFor52WeekHighs } = require("./scanner");

// ─── CONFIGURATION ───
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PORT = process.env.PORT || 3000;

// ─── INITIALIZE ───
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = express();
app.use(express.json());

console.log("🚀 Trade Infinity Bot starting...");

// ============================================
// PART 1: TELEGRAM BOT COMMANDS
// ============================================

// /start command — first message when user opens the bot
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "Trader";

  const welcomeMessage = `
🟢 *Welcome to Trade Infinity, ${firstName}!*

I send you real-time alerts when Nifty 100 stocks hit their 52-week high — with entry price, target (+30%), and stop loss (-15%).

*To get started:*
1️⃣ Send me your registered email: just type it below
2️⃣ Once linked, you'll receive alerts automatically!

*Commands:*
/link your@email.com — Connect your account
/status — Check your subscription
/lastalert — See the most recent alert
/help — All available commands

📊 Strategy: 52-Week High Breakout
🎯 Target: +30% | 🛡️ Stop Loss: -15%
🇮🇳 Market: NSE Nifty 100
`;

  bot.sendMessage(chatId, welcomeMessage, { parse_mode: "Markdown" });
});

// /link command — connect Telegram to their website account
bot.onText(/\/link (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const email = match[1].trim().toLowerCase();

  // Validate email format
  if (!email.includes("@") || !email.includes(".")) {
    bot.sendMessage(chatId, "❌ That doesn't look like a valid email. Try again:\n/link your@email.com");
    return;
  }

  // Check if user exists in database
  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !user) {
    bot.sendMessage(chatId, `❌ No account found with *${email}*.\n\nPlease sign up first at our website, then come back and try /link again.`, { parse_mode: "Markdown" });
    return;
  }

  // Link the Telegram chat to this user
  const { error: updateError } = await supabase
    .from("users")
    .update({ telegram_chat_id: chatId, telegram_connected: true })
    .eq("email", email);

  if (updateError) {
    bot.sendMessage(chatId, "⚠️ Something went wrong. Please try again or contact us on WhatsApp: +91 78691 43383");
    return;
  }

  const planInfo = user.plan === "pro" ? "PRO ✨" : user.plan === "trial" ? "FREE TRIAL (7 days)" : "FREE";

  bot.sendMessage(chatId, `
✅ *Account linked successfully!*

📧 Email: ${email}
📦 Plan: ${planInfo}

You'll now receive alerts whenever a Nifty 100 stock hits its 52-week high. Alerts include stock name, entry price, target, and stop loss.

${user.plan === "free" ? "\n💡 Start your 7-day free trial on our website to receive alerts!" : ""}
`, { parse_mode: "Markdown" });
});

// If user just types an email (without /link), help them
bot.on("message", async (msg) => {
  const text = msg.text || "";
  const chatId = msg.chat.id;

  // Skip if it's a command
  if (text.startsWith("/")) return;

  // Check if it looks like an email
  if (text.includes("@") && text.includes(".")) {
    bot.sendMessage(chatId, `Looks like you want to link your account! Use this command:\n\n/link ${text.trim()}`);
    return;
  }
});

// /status command — check subscription status
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .single();

  if (error || !user) {
    bot.sendMessage(chatId, "❌ Your Telegram is not linked to any account yet.\n\nUse /link your@email.com to connect.");
    return;
  }

  let planStatus = "";
  const now = new Date();

  if (user.plan === "pro") {
    planStatus = "✨ *PRO PLAN* — Active\nYou have unlimited access to all alerts.";
  } else if (user.plan === "trial") {
    const trialEnd = new Date(user.trial_end);
    const daysLeft = Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)));
    if (daysLeft > 0) {
      planStatus = `🟡 *FREE TRIAL* — ${daysLeft} days remaining\nTrial ends: ${trialEnd.toLocaleDateString("en-IN")}`;
    } else {
      planStatus = "🔴 *FREE TRIAL EXPIRED*\nUpgrade to Pro at our website to continue receiving alerts.";
    }
  } else {
    planStatus = "⚪ *FREE PLAN*\nStart your 7-day trial on our website to receive alerts.";
  }

  bot.sendMessage(chatId, `
📊 *Your Trade Infinity Status*

📧 ${user.email}
${planStatus}
🔗 Telegram: Connected ✅

Need help? WhatsApp: +91 78691 43383
`, { parse_mode: "Markdown" });
});

// /lastalert command — show most recent alert
bot.onText(/\/lastalert/, async (msg) => {
  const chatId = msg.chat.id;

  const { data: alert, error } = await supabase
    .from("alerts_log")
    .select("*")
    .order("triggered_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !alert) {
    bot.sendMessage(chatId, "No alerts have been sent yet. Alerts trigger when a Nifty 100 stock hits its 52-week high during market hours (9:15 AM — 3:30 PM IST).");
    return;
  }

  bot.sendMessage(chatId, formatAlertMessage(alert), { parse_mode: "Markdown" });
});

// /help command
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, `
*Trade Infinity Bot — Commands*

/start — Welcome message
/link your@email.com — Connect your account
/status — Check your plan & trial
/lastalert — See last trade alert
/help — This message

*How alerts work:*
Every trading day, we scan all 100 stocks in the Nifty 100 index. When a stock hits its 52-week high, we send you an alert with:
• Stock name
• Entry price (current price)
• Target (+30% from entry)
• Stop Loss (-15% from entry)

*Strategy:* 52-Week High Breakout
*Market:* NSE India — Nifty 100

Questions? WhatsApp: +91 78691 43383
Email: tradeinfinity1410@gmail.com
`, { parse_mode: "Markdown" });
});

// ============================================
// PART 2: ALERT ENGINE — Scans & Sends Alerts
// ============================================

/**
 * Format the alert message for Telegram
 */
function formatAlertMessage(alert) {
  return `
🟢 *NEW TRADE ALERT*
━━━━━━━━━━━━━━━━━━

📊 *${alert.stock_name}*
Strategy: 52-Week High Breakout

💰 Entry Price: ₹${Number(alert.entry_price).toLocaleString("en-IN")}
🎯 Target (+30%): ₹${Number(alert.target_price).toLocaleString("en-IN")}
🛡️ Stop Loss (-15%): ₹${Number(alert.sl_price).toLocaleString("en-IN")}

📈 Risk:Reward = 1:2
🇮🇳 Exchange: NSE
⏰ ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}

_Trade at your own risk. Not SEBI registered._
`;
}

/**
 * Send alert to all eligible users (trial with days left + pro users)
 */
async function sendAlertToUsers(alert) {
  const now = new Date();

  // Get all users who have Telegram connected AND have an active plan
  const { data: users, error } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_connected", true)
    .not("telegram_chat_id", "is", null);

  if (error || !users) {
    console.log("Error fetching users:", error);
    return 0;
  }

  let sentCount = 0;
  const message = formatAlertMessage(alert);

  for (const user of users) {
    // Check if user has access
    let hasAccess = false;

    if (user.plan === "pro") {
      hasAccess = true;
    } else if (user.plan === "trial" && user.trial_end) {
      const trialEnd = new Date(user.trial_end);
      hasAccess = now < trialEnd;
    }

    if (hasAccess && user.telegram_chat_id) {
      try {
        await bot.sendMessage(user.telegram_chat_id, message, { parse_mode: "Markdown" });
        sentCount++;
        // Small delay to avoid Telegram rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.log(`Failed to send to ${user.email}:`, err.message);
        // If user blocked the bot, mark as disconnected
        if (err.response && err.response.statusCode === 403) {
          await supabase
            .from("users")
            .update({ telegram_connected: false })
            .eq("id", user.id);
        }
      }
    }
  }

  return sentCount;
}

/**
 * MAIN SCAN FUNCTION — runs on schedule
 * Checks for 52-week highs and sends alerts
 */
async function runDailyScan() {
  console.log("═══════════════════════════════════════");
  console.log("🔍 Running daily 52-week high scan...");
  console.log("Time:", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }));
  console.log("═══════════════════════════════════════");

  try {
    const alerts = await scanFor52WeekHighs();

    if (alerts.length === 0) {
      console.log("📭 No Nifty 100 stocks hitting 52-week highs today.");
      return;
    }

    console.log(`🎯 Found ${alerts.length} stocks at 52-week highs!`);

    for (const alert of alerts) {
      // Save to database
      const { error: logError } = await supabase
        .from("alerts_log")
        .insert({
          stock_name: alert.stock_name,
          entry_price: alert.entry_price,
          target_price: alert.target_price,
          sl_price: alert.sl_price,
          strategy: "52-Week High Breakout",
        });

      if (logError) {
        console.log("Error logging alert:", logError);
      }

      // Send to all eligible users
      const sentCount = await sendAlertToUsers(alert);

      // Update sent count
      console.log(`📤 Alert for ${alert.stock_name} sent to ${sentCount} users`);

      // Delay between alerts
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  } catch (err) {
    console.error("❌ Scan error:", err);
  }
}

// ============================================
// PART 3: SCHEDULED SCANNING
// ============================================
// Indian market hours: 9:15 AM — 3:30 PM IST (Mon-Fri)
// We scan at multiple points during the day

// Scan at 10:00 AM IST (after market settles)
cron.schedule("30 4 * * 1-5", () => {
  // 4:30 UTC = 10:00 AM IST
  console.log("⏰ Scheduled scan: 10:00 AM IST");
  runDailyScan();
}, { timezone: "Asia/Kolkata" });

// Scan at 1:00 PM IST (mid-day check)
cron.schedule("0 7 * * 1-5", () => {
  console.log("⏰ Scheduled scan: 1:00 PM IST");
  runDailyScan();
}, { timezone: "Asia/Kolkata" });

// Scan at 3:15 PM IST (near market close)
cron.schedule("45 9 * * 1-5", () => {
  console.log("⏰ Scheduled scan: 3:15 PM IST");
  runDailyScan();
}, { timezone: "Asia/Kolkata" });

// Daily trial expiry check — runs at midnight IST
cron.schedule("30 18 * * *", async () => {
  // 6:30 PM UTC = midnight IST
  console.log("🔄 Checking for expired trials...");
  
  const now = new Date().toISOString();
  
  const { data: expiredUsers, error } = await supabase
    .from("users")
    .update({ plan: "free" })
    .eq("plan", "trial")
    .lt("trial_end", now)
    .select();

  if (expiredUsers && expiredUsers.length > 0) {
    console.log(`⏰ ${expiredUsers.length} trial(s) expired`);
    
    // Notify expired users
    for (const user of expiredUsers) {
      if (user.telegram_chat_id && user.telegram_connected) {
        try {
          bot.sendMessage(user.telegram_chat_id, `
⏰ *Your 7-day free trial has ended.*

You won't receive new alerts until you upgrade. Your past alerts are still saved.

✨ Upgrade to Pro (₹499/mo) to continue getting Nifty 100 alerts:
→ Visit our website

Questions? WhatsApp: +91 78691 43383
`, { parse_mode: "Markdown" });
        } catch (err) {
          console.log("Error notifying expired user:", err.message);
        }
      }
    }
  }
}, { timezone: "Asia/Kolkata" });

// ============================================
// PART 4: EXPRESS SERVER (keeps the bot alive)
// ============================================

// Health check endpoint (Railway/Render needs this)
app.get("/", (req, res) => {
  res.json({
    status: "running",
    bot: "Trade Infinity",
    strategy: "52-Week High Breakout (Nifty 100)",
    uptime: process.uptime(),
  });
});

// API endpoint — website can use this to register users
app.post("/api/register", async (req, res) => {
  const { email, name, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 7);

  const { data, error } = await supabase
    .from("users")
    .insert({
      email: email.toLowerCase(),
      name: name || "Trader",
      password_hash: password, // In production, hash this!
      plan: "trial",
      trial_start: new Date().toISOString(),
      trial_end: trialEnd.toISOString(),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return res.status(400).json({ error: "Email already registered" });
    }
    return res.status(500).json({ error: "Registration failed" });
  }

  res.json({ success: true, plan: "trial", trial_end: trialEnd.toISOString() });
});

// API endpoint — activate pro plan (called after Cashfree payment)
app.post("/api/activate-pro", async (req, res) => {
  const { email } = req.body;

  const { data, error } = await supabase
    .from("users")
    .update({ plan: "pro", pro_start: new Date().toISOString() })
    .eq("email", email.toLowerCase())
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: "Activation failed" });
  }

  // Notify user on Telegram if connected
  if (data.telegram_chat_id && data.telegram_connected) {
    bot.sendMessage(data.telegram_chat_id, `
✨ *PRO PLAN ACTIVATED!*

You now have unlimited access to all Trade Infinity alerts. Welcome aboard!

📊 You'll receive alerts for every Nifty 100 stock hitting its 52-week high.
`, { parse_mode: "Markdown" });
  }

  res.json({ success: true, plan: "pro" });
});

// API endpoint — manual alert trigger (for you, the admin)
app.post("/api/manual-alert", async (req, res) => {
  const { stock_name, entry_price, target_price, sl_price, admin_key } = req.body;

  // Simple admin protection
  if (admin_key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const alert = { stock_name, entry_price, target_price, sl_price };
  
  // Log it
  await supabase.from("alerts_log").insert({
    stock_name,
    entry_price,
    target_price,
    sl_price,
    strategy: "52-Week High Breakout",
  });

  // Send to users
  const sentCount = await sendAlertToUsers(alert);

  res.json({ success: true, sent_to: sentCount });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log("🤖 Telegram bot is active");
  console.log("📊 Scanning schedule: 10:00 AM, 1:00 PM, 3:15 PM IST (Mon-Fri)");
  console.log("═══════════════════════════════════════");
});
