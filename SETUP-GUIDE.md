# 🚀 TRADE INFINITY BOT — SETUP GUIDE
## Complete step-by-step instructions (zero coding knowledge needed)

---

## WHAT THIS BOT DOES:
- Automatically checks all 100 stocks in the Nifty 100 index
- When a stock hits its 52-week high → sends alert on Telegram
- Alert includes: Stock name, Entry price, Target (+30%), Stop Loss (-15%)
- Only sends to users who have an active trial or pro plan
- Trial expires after 7 days automatically

---

## STEP 1: CREATE TELEGRAM BOT (2 minutes)
1. Open Telegram
2. Search for @BotFather
3. Send: /newbot
4. Name: Trade Infinity
5. Username: TradeInfinityBot (or TradeInfinity_Bot)
6. SAVE THE TOKEN (looks like 7123456789:AAHxxxxxxxxx)

---

## STEP 2: CREATE SUPABASE DATABASE (5 minutes)
1. Go to https://supabase.com → Sign up (free)
2. Click "New Project"
3. Name: trade-infinity
4. Set a database password → SAVE IT
5. Region: Choose "South Asia (Mumbai)" if available
6. Wait 2 minutes for it to create
7. Go to SQL Editor (left sidebar) → New Query
8. Copy-paste EVERYTHING from the file "database-setup.sql"
9. Click "Run" → Should say "Success"
10. Go to Settings → API → Copy these two things:
    - Project URL (looks like https://xxxxx.supabase.co)
    - anon public key (long string starting with eyJ...)

---

## STEP 3: DEPLOY BOT ON RENDER.COM (5 minutes)
Why Render? It's free, keeps your bot running 24/7, and is very simple.

1. Go to https://render.com → Sign up with GitHub
2. In your GitHub, create a new repository called "trade-infinity-bot"
3. Upload ALL these files to that repo:
   - bot.js
   - scanner.js
   - package.json
   - .env.example (rename to just reading reference)
4. Back on Render → "New" → "Web Service"
5. Connect your GitHub repo "trade-infinity-bot"
6. Settings:
   - Name: trade-infinity-bot
   - Runtime: Node
   - Build command: npm install
   - Start command: node bot.js
7. Click "Environment" tab → Add these variables:
   - TELEGRAM_BOT_TOKEN = (paste your bot token from BotFather)
   - SUPABASE_URL = (paste from Supabase settings)
   - SUPABASE_KEY = (paste the anon key from Supabase)
   - ADMIN_KEY = (make up a secret password, e.g. ti_admin_2026)
   - PORT = 3000
8. Click "Deploy" → Wait 2-3 minutes
9. You'll get a URL like https://trade-infinity-bot.onrender.com

---

## STEP 4: TEST YOUR BOT (2 minutes)
1. Open Telegram
2. Search for your bot (@TradeInfinityBot)
3. Send: /start
4. You should see the welcome message!
5. Try: /help
6. Try: /status (should say "not linked")

---

## STEP 5: TEST A MANUAL ALERT
You can send a test alert manually using this URL in your browser
or any tool like Postman:

POST https://trade-infinity-bot.onrender.com/api/manual-alert
Body (JSON):
{
  "stock_name": "RELIANCE",
  "entry_price": 2950,
  "target_price": 3835,
  "sl_price": 2507.5,
  "admin_key": "your_admin_key_here"
}

This will send an alert to all connected trial/pro users!

---

## HOW IT ALL WORKS TOGETHER:

Website (Vercel) → User signs up → Saved in Supabase database
                  → User pays    → Plan updated to "pro" in database

Bot (Render)     → User sends /link email → Bot links Telegram to database
                 → Every day at 10 AM, 1 PM, 3:15 PM IST:
                    → Bot checks NSE for 52-week highs in Nifty 100
                    → If found → sends alert to all trial + pro users
                    → Logs alert in database

Admin (You)      → Can send manual alerts via API
                 → Can check database on Supabase dashboard
                 → Can see who's subscribed, trial expiry dates, etc.

---

## DAILY SCHEDULE (ALL AUTOMATIC):
- 10:00 AM IST — First scan (after market settles)
- 1:00 PM IST  — Mid-day scan
- 3:15 PM IST  — Near market close scan
- 12:00 AM IST — Check for expired trials

---

## COSTS:
- Telegram Bot: FREE forever
- Supabase: FREE (up to 50,000 rows, 500MB)
- Render.com: FREE (may sleep after 15 min inactivity, auto-wakes)
- NSE Data: FREE (public API)

Total: ₹0/month

---

## IMPORTANT NOTES:
1. Render free tier may "sleep" after 15 min of no requests.
   The bot will auto-wake when someone messages it, but scheduled
   scans might occasionally be missed. Upgrading to Render's $7/mo
   plan fixes this (do this after you get the grant money).

2. The NSE API can sometimes be unreliable. If the automatic
   scanner misses a stock, you can always send a manual alert
   using the /api/manual-alert endpoint.

3. For the prototype/demo, you can use manual alerts to show
   the judges how it works — send a test alert during your
   presentation!

---

## TROUBLESHOOTING:
- Bot not responding? → Check Render dashboard for errors
- No alerts? → NSE API might be down, use manual alert
- Trial not expiring? → Check Supabase for trial_end dates
- Need help? → Come back to Claude and ask!
