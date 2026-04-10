const TelegramBot = require("node-telegram-bot-api");
const { createClient } = require("@supabase/supabase-js");
const cron = require("node-cron");
const express = require("express");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "ti_admin_2026";
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID || "";
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY || "";
const CASHFREE_ENV = process.env.CASHFREE_ENV || "TEST";
const PORT = process.env.PORT || 3000;

const CASHFREE_BASE = CASHFREE_ENV === "PROD"
  ? "https://api.cashfree.com/pg"
  : "https://sandbox.cashfree.com/pg";

if (!BOT_TOKEN) { console.error("FATAL: TELEGRAM_BOT_TOKEN missing!"); process.exit(1); }

console.log("Trade Infinity Bot v4 starting...");
console.log("Cashfree:", CASHFREE_APP_ID ? "configured (" + CASHFREE_ENV + ")" : "NOT configured");

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log("Telegram bot connected!");

let supabase = null, dbOk = false;
if (SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL.startsWith("http")) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  dbOk = true;
  console.log("Supabase connected!");
}

const app = express();
app.use(express.json());

// CORS — allow your Vercel website to call this server
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/", (req, res) => res.json({ status: "running", version: "v4", db: dbOk, cashfree: !!CASHFREE_APP_ID }));

app.listen(PORT, () => {
  console.log("Server on port " + PORT);
  console.log("============ BOT v4 READY ============");
});

bot.on("polling_error", (err) => console.log("Poll:", err.code));
bot.on("error", (err) => console.log("Err:", err.message));
process.on("uncaughtException", (err) => console.log("Uncaught:", err.message));
process.on("unhandledRejection", (err) => console.log("Unhandled:", err));

async function safeSend(chatId, text, opts = {}) {
  try { await bot.sendMessage(chatId, text, opts); return true; } catch (e) { console.log("Send fail:", e.message); return false; }
}

// ============================================
// TELEGRAM COMMANDS
// ============================================
bot.onText(/\/start/, async (msg) => {
  await safeSend(msg.chat.id,
    "🟢 *Welcome to Trade Infinity, " + (msg.from.first_name||"Trader") + "!*\n\n" +
    "📊 Strategy: 52-Week High Breakout\n🎯 +30% Target | 🛡️ -15% SL\n🇮🇳 NSE Nifty 100\n\n" +
    "*Commands:*\n/link your@email.com — Connect account\n/status — Check plan\n/lastalert — Last alert\n/reset — Unlink account\n/help — All commands\n\n" +
    "👉 Sign up on website → /link your email here", { parse_mode: "Markdown" });
});

bot.onText(/\/help/, async (msg) => {
  await safeSend(msg.chat.id,
    "📖 *Commands:*\n/start — Welcome\n/link email — Connect\n/status — Plan info\n/lastalert — Last alert\n/reset — Unlink\n/test — Health check\n/help — This\n\n📱 +91 78691 43383\n📧 tradeinfinity1410@gmail.com", { parse_mode: "Markdown" });
});

bot.onText(/\/test/, async (msg) => {
  let ds = "Not configured";
  if (dbOk) { try { const{error}=await supabase.from("users").select("id").limit(1); ds=error?"Error":"Connected!"; } catch(e){ ds="Error"; } }
  await safeSend(msg.chat.id, "🔧 *Status*\n🤖 Bot: Running\n🗄️ DB: "+ds+"\n💳 Cashfree: "+(CASHFREE_APP_ID?"Configured":"Not set")+"\n⏰ "+new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}), {parse_mode:"Markdown"});
});

bot.onText(/\/link (.+)/, async (msg, match) => {
  const chatId = msg.chat.id, email = match[1].trim().toLowerCase();
  if (!email.includes("@")||!email.includes(".")) { await safeSend(chatId, "❌ Invalid email.\n/link yourname@gmail.com"); return; }
  if (!dbOk) { await safeSend(chatId, "⚠️ DB not ready. WhatsApp: +91 78691 43383"); return; }
  try {
    // Unlink old accounts from this chat
    const{data:old}=await supabase.from("users").select("id,email").eq("telegram_chat_id",chatId);
    if(old) for(const o of old) if(o.email!==email) await supabase.from("users").update({telegram_chat_id:null,telegram_connected:false}).eq("id",o.id);
    // Find new account
    const{data:users,error}=await supabase.from("users").select("*").eq("email",email);
    if(error||!users||users.length===0){await safeSend(chatId,"❌ No account for *"+email+"*\nSign up on website first.",{parse_mode:"Markdown"});return;}
    const u=users[0];
    await supabase.from("users").update({telegram_chat_id:chatId,telegram_connected:true}).eq("id",u.id);
    let pl="FREE";
    if(u.plan==="pro"){const de=u.pro_end?Math.max(0,Math.ceil((new Date(u.pro_end)-new Date())/86400000)):30;pl="PRO ✨ ("+de+" days left)";}
    else if(u.plan==="trial"){const dl=Math.max(0,Math.ceil((new Date(u.trial_end)-new Date())/86400000));pl=dl>0?"TRIAL ("+dl+"d left)":"TRIAL (expired)";}
    await safeSend(chatId,"✅ *Linked!*\n📧 "+email+"\n📦 "+pl+"\n\nYou'll get alerts!",{parse_mode:"Markdown"});
  } catch(e){console.log("/link err:",e.message);await safeSend(chatId,"⚠️ Error. Try again.");}
});

bot.onText(/\/reset/, async (msg) => {
  const chatId=msg.chat.id;
  if(!dbOk){await safeSend(chatId,"DB not ready.");return;}
  try{
    const{data}=await supabase.from("users").select("id").eq("telegram_chat_id",chatId);
    if(!data||data.length===0){await safeSend(chatId,"Nothing linked. Use /link email");return;}
    for(const u of data) await supabase.from("users").update({telegram_chat_id:null,telegram_connected:false}).eq("id",u.id);
    await safeSend(chatId,"🔄 *Unlinked!* Use /link newemail@gmail.com",{parse_mode:"Markdown"});
  }catch(e){await safeSend(chatId,"⚠️ Error.");}
});

bot.onText(/\/status/, async (msg) => {
  const chatId=msg.chat.id;
  if(!dbOk){await safeSend(chatId,"⚠️ DB not ready.");return;}
  try{
    const{data:users}=await supabase.from("users").select("*").eq("telegram_chat_id",chatId);
    if(!users||users.length===0){await safeSend(chatId,"❌ Not linked. /link your@email.com");return;}
    const u=users[0];let ps="";
    if(u.plan==="pro"){
      const de=u.pro_end?Math.max(0,Math.ceil((new Date(u.pro_end)-new Date())/86400000)):"∞";
      ps="✨ *PRO* — "+de+" days left";
    }else if(u.plan==="trial"){
      const dl=Math.max(0,Math.ceil((new Date(u.trial_end)-new Date())/86400000));
      ps=dl>0?"🟡 *TRIAL* — "+dl+" days left":"🔴 *EXPIRED* — Upgrade on website";
    }else ps="⚪ *FREE* — Start trial on website";
    await safeSend(chatId,"📊 *Status*\n📧 "+u.email+"\n📦 "+ps+"\n🔗 Telegram: ✅",{parse_mode:"Markdown"});
  }catch(e){await safeSend(chatId,"⚠️ Error.");}
});

bot.onText(/\/lastalert/, async (msg) => {
  if(!dbOk){await safeSend(msg.chat.id,"📭 No alerts yet.");return;}
  try{
    const{data}=await supabase.from("alerts_log").select("*").order("triggered_at",{ascending:false}).limit(1);
    if(!data||data.length===0){await safeSend(msg.chat.id,"📭 No alerts yet. Mon-Fri market hours.");return;}
    await safeSend(msg.chat.id,formatAlert(data[0]),{parse_mode:"Markdown"});
  }catch(e){await safeSend(msg.chat.id,"⚠️ Error.");}
});

bot.on("message", async (msg) => {
  const t=(msg.text||"").trim();if(t.startsWith("/"))return;
  if(t.includes("@")&&t.includes(".")&&!t.includes(" ")){await safeSend(msg.chat.id,"Use: /link "+t);return;}
  if(t.length>0) await safeSend(msg.chat.id,"👋 /help for commands");
});

// ============================================
// ALERT SYSTEM
// ============================================
function formatAlert(a){
  return "🟢 *TRADE ALERT*\n━━━━━━━━━━━━━━━━━━\n\n📊 *"+a.stock_name+"*\n52-Week High Breakout\n\n💰 Entry: ₹"+Number(a.entry_price).toLocaleString("en-IN")+"\n🎯 Target: ₹"+Number(a.target_price).toLocaleString("en-IN")+"\n🛡️ SL: ₹"+Number(a.sl_price).toLocaleString("en-IN")+"\n\n📈 1:2 RR | 🇮🇳 NSE\n⏰ "+new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})+"\n\n_Not SEBI registered._";
}

async function sendAlertToUsers(ad){
  if(!dbOk)return 0;
  try{
    const{data:users}=await supabase.from("users").select("*").eq("telegram_connected",true).not("telegram_chat_id","is",null);
    if(!users)return 0;let c=0;const msg=formatAlert(ad);const now=new Date();
    for(const u of users){
      let ok=false;
      if(u.plan==="pro"){ok=!u.pro_end||now<new Date(u.pro_end);}
      else if(u.plan==="trial"&&u.trial_end){ok=now<new Date(u.trial_end);}
      if(ok&&u.telegram_chat_id){const s=await safeSend(u.telegram_chat_id,msg,{parse_mode:"Markdown"});if(s)c++;await new Promise(r=>setTimeout(r,200));}
    }
    return c;
  }catch(e){return 0;}
}

// Scans
async function runScan(){
  console.log("Scan: "+new Date().toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}));
  try{
    const r=await fetch("https://www.nseindia.com/api/live-analysis-52Week-high",{headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json","Referer":"https://www.nseindia.com/"}});
    if(!r.ok)return;const d=await r.json();
    const n100=["RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK","SBIN","BHARTIARTL","BAJFINANCE","ITC","KOTAKBANK","LT","HCLTECH","AXISBANK","MARUTI","SUNPHARMA","TATAMOTORS","TITAN","NTPC","POWERGRID","M&M","JSWSTEEL","ADANIPORTS","COALINDIA","HAL","BEL","TRENT","ZOMATO","IRFC","SIEMENS","ABB","BAJAJ-AUTO","EICHERMOT","CIPLA","DRREDDY","APOLLOHOSP","WIPRO","TECHM"];
    if(d.data)for(const s of d.data){
      if(n100.includes(s.symbol)){const p=parseFloat((s.ltp||"0").toString().replace(/,/g,""));
        if(p>0){const ad={stock_name:s.symbol,entry_price:p,target_price:Math.round(p*1.3*100)/100,sl_price:Math.round(p*0.85*100)/100};
          if(dbOk)await supabase.from("alerts_log").insert({...ad,strategy:"52-Week High Breakout"});
          const n=await sendAlertToUsers(ad);console.log(s.symbol+": "+n+" users");}}
    }
  }catch(e){console.log("Scan err:",e.message);}
}

cron.schedule("0 10 * * 1-5",runScan,{timezone:"Asia/Kolkata"});
cron.schedule("0 13 * * 1-5",runScan,{timezone:"Asia/Kolkata"});
cron.schedule("15 15 * * 1-5",runScan,{timezone:"Asia/Kolkata"});

// Midnight: expire trials AND pro subscriptions
cron.schedule("0 0 * * *", async () => {
  if(!dbOk)return;
  try{
    // Expire trials
    const{data:t}=await supabase.from("users").update({plan:"free"}).eq("plan","trial").lt("trial_end",new Date().toISOString()).select();
    if(t)for(const u of t){if(u.telegram_chat_id)await safeSend(u.telegram_chat_id,"⏰ *Trial ended.* Upgrade to Pro on website.\n📱 +91 78691 43383",{parse_mode:"Markdown"});}
    // Expire pro subscriptions (1 month over)
    const{data:p}=await supabase.from("users").update({plan:"free"}).eq("plan","pro").not("pro_end","is",null).lt("pro_end",new Date().toISOString()).select();
    if(p)for(const u of p){if(u.telegram_chat_id)await safeSend(u.telegram_chat_id,"⏰ *Pro plan expired.* Renew on our website to keep getting alerts.\n📱 +91 78691 43383",{parse_mode:"Markdown"});}
  }catch(e){console.log("Expire err:",e.message);}
},{timezone:"Asia/Kolkata"});

// ============================================
// API: COUPON VALIDATION
// ============================================
app.post("/api/validate-coupon", async (req, res) => {
  if(!dbOk) return res.status(503).json({error:"DB not ready"});
  try{
    const{code}=req.body;
    if(!code)return res.status(400).json({error:"No coupon code"});
    const{data,error}=await supabase.from("coupons").select("*").eq("code",code.toUpperCase().trim()).eq("is_active",true).limit(1);
    if(error||!data||data.length===0)return res.json({valid:false,message:"Invalid coupon code"});
    const coupon=data[0];
    if(coupon.times_used>=coupon.max_uses)return res.json({valid:false,message:"Coupon expired (max uses reached)"});
    const finalPrice=Math.max(1, 499-coupon.discount_amount);
    res.json({valid:true,discount:coupon.discount_amount,final_price:finalPrice,message:"Coupon applied! You pay ₹"+finalPrice+" instead of ₹499"});
  }catch(e){res.status(500).json({error:e.message});}
});

// ============================================
// API: CREATE CASHFREE ORDER
// ============================================
app.post("/api/create-order", async (req, res) => {
  if(!dbOk)return res.status(503).json({error:"DB not ready"});
  if(!CASHFREE_APP_ID)return res.status(503).json({error:"Cashfree not configured"});

  try{
    const{email, coupon_code}=req.body;
    if(!email)return res.status(400).json({error:"Email required"});

    // Find user
    const{data:users}=await supabase.from("users").select("*").eq("email",email.toLowerCase().trim());
    if(!users||users.length===0)return res.status(404).json({error:"User not found"});
    const user=users[0];

    // Calculate price (with coupon if provided)
    let amount=499;
    let appliedCoupon=null;
    if(coupon_code){
      const{data:coupons}=await supabase.from("coupons").select("*").eq("code",coupon_code.toUpperCase().trim()).eq("is_active",true);
      if(coupons&&coupons.length>0&&coupons[0].times_used<coupons[0].max_uses){
        appliedCoupon=coupons[0];
        amount=Math.max(1, 499-appliedCoupon.discount_amount);
      }
    }

    // Create unique order ID
    const orderId="TI_"+Date.now()+"_"+Math.random().toString(36).substring(2,8);

    // Create Cashfree order
    const cfResponse=await fetch(CASHFREE_BASE+"/orders",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-client-id":CASHFREE_APP_ID,
        "x-client-secret":CASHFREE_SECRET_KEY,
        "x-api-version":"2023-08-01",
      },
      body:JSON.stringify({
        order_id:orderId,
        order_amount:amount,
        order_currency:"INR",
        customer_details:{
          customer_id:user.id,
          customer_email:email,
          customer_phone:"9999999999",
          customer_name:user.name||"Trader",
        },
        order_meta:{
          return_url:req.headers.origin+"/payment-success?order_id={order_id}",
        },
        order_note:"Trade Infinity Pro Plan - 1 Month",
      }),
    });

    const cfData=await cfResponse.json();
    console.log("Cashfree order response:", JSON.stringify(cfData));

    if(!cfResponse.ok||!cfData.payment_session_id){
      console.log("Cashfree error:", cfData);
      return res.status(500).json({error:"Payment creation failed. Check Cashfree credentials."});
    }

    // Save payment record
    const proEnd=new Date();proEnd.setDate(proEnd.getDate()+30);
    await supabase.from("payments").insert({
      user_id:user.id,
      email:email.toLowerCase().trim(),
      amount,
      original_amount:499,
      coupon_code:appliedCoupon?appliedCoupon.code:null,
      cashfree_order_id:orderId,
      payment_status:"pending",
      pro_end:proEnd.toISOString(),
    });

    // Increment coupon usage
    if(appliedCoupon){
      await supabase.from("coupons").update({times_used:appliedCoupon.times_used+1}).eq("id",appliedCoupon.id);
    }

    res.json({
      success:true,
      order_id:orderId,
      payment_session_id:cfData.payment_session_id,
      amount,
      cf_order_id:cfData.cf_order_id,
      environment:CASHFREE_ENV,
    });

  }catch(e){
    console.log("Create order error:",e.message);
    res.status(500).json({error:e.message});
  }
});

// ============================================
// API: VERIFY PAYMENT (after user pays)
// ============================================
app.post("/api/verify-payment", async (req, res) => {
  if(!dbOk)return res.status(503).json({error:"DB not ready"});
  try{
    const{order_id}=req.body;
    if(!order_id)return res.status(400).json({error:"Order ID required"});

    // Check with Cashfree if payment is successful
    const cfResponse=await fetch(CASHFREE_BASE+"/orders/"+order_id,{
      headers:{
        "x-client-id":CASHFREE_APP_ID,
        "x-client-secret":CASHFREE_SECRET_KEY,
        "x-api-version":"2023-08-01",
      },
    });

    const cfData=await cfResponse.json();
    console.log("Payment verify:", order_id, cfData.order_status);

    if(cfData.order_status==="PAID"){
      // Get payment record
      const{data:payments}=await supabase.from("payments").select("*").eq("cashfree_order_id",order_id);
      if(!payments||payments.length===0)return res.status(404).json({error:"Payment record not found"});
      const payment=payments[0];

      // Update payment status
      const proEnd=new Date();proEnd.setDate(proEnd.getDate()+30);
      await supabase.from("payments").update({payment_status:"paid",pro_start:new Date().toISOString(),pro_end:proEnd.toISOString()}).eq("cashfree_order_id",order_id);

      // Activate PRO for the user
      await supabase.from("users").update({plan:"pro",pro_start:new Date().toISOString(),pro_end:proEnd.toISOString()}).eq("email",payment.email);

      // Notify on Telegram
      const{data:user}=await supabase.from("users").select("*").eq("email",payment.email).single();
      if(user&&user.telegram_chat_id&&user.telegram_connected){
        await safeSend(user.telegram_chat_id,"✨ *PRO PLAN ACTIVATED!*\n\n📦 Plan: Pro\n⏰ Valid for 30 days\n📧 "+payment.email+"\n💰 Paid: ₹"+payment.amount+"\n\nYou now get unlimited alerts!",{parse_mode:"Markdown"});
      }

      return res.json({success:true,plan:"pro",pro_end:proEnd.toISOString(),amount_paid:payment.amount});
    }else{
      // Payment not successful
      if(cfData.order_status==="ACTIVE")return res.json({success:false,status:"pending",message:"Payment not completed yet"});
      await supabase.from("payments").update({payment_status:"failed"}).eq("cashfree_order_id",order_id);
      return res.json({success:false,status:cfData.order_status,message:"Payment failed or cancelled"});
    }
  }catch(e){
    console.log("Verify err:",e.message);
    res.status(500).json({error:e.message});
  }
});

// ============================================
// EXISTING APIs (register, login, etc.)
// ============================================
app.post("/api/register", async (req, res) => {
  if(!dbOk)return res.status(503).json({error:"DB not ready"});
  try{
    const{email,name,password}=req.body;if(!email||!password)return res.status(400).json({error:"Required"});
    const te=new Date();te.setDate(te.getDate()+7);
    const{data,error}=await supabase.from("users").insert({email:email.toLowerCase().trim(),name:name||"Trader",password_hash:password,plan:"trial",trial_start:new Date().toISOString(),trial_end:te.toISOString()}).select().single();
    if(error)return res.status(error.code==="23505"?400:500).json({error:error.code==="23505"?"Email exists":error.message});
    res.json({success:true,plan:"trial",trial_end:te.toISOString()});
  }catch(e){res.status(500).json({error:e.message});}
});

app.post("/api/login", async (req, res) => {
  if(!dbOk)return res.status(503).json({error:"DB not ready"});
  try{
    const{email,password}=req.body;
    const{data:users}=await supabase.from("users").select("*").eq("email",email.toLowerCase().trim()).eq("password_hash",password);
    if(!users||users.length===0)return res.status(401).json({error:"Invalid credentials"});
    const u=users[0];let plan=u.plan;
    if(plan==="trial"&&u.trial_end&&new Date()>new Date(u.trial_end)){plan="free";await supabase.from("users").update({plan:"free"}).eq("id",u.id);}
    if(plan==="pro"&&u.pro_end&&new Date()>new Date(u.pro_end)){plan="free";await supabase.from("users").update({plan:"free"}).eq("id",u.id);}
    res.json({success:true,user:{id:u.id,email:u.email,name:u.name,plan,trial_end:u.trial_end,pro_end:u.pro_end,telegram_connected:u.telegram_connected}});
  }catch(e){res.status(500).json({error:e.message});}
});

// Manual alert (admin)
app.get("/api/send-alert", async (req, res) => {
  const{stock,entry,key}=req.query;
  if(key!==ADMIN_KEY)return res.send("<h2>Wrong key</h2>");
  if(!stock||!entry)return res.send("<html><body style='font-family:sans-serif;padding:40px;max-width:500px;margin:0 auto;background:#111;color:#eee'><h2>📤 Send Alert</h2><form method='GET'><input type='hidden' name='key' value='"+key+"'><p>Stock:</p><input name='stock' style='padding:10px;width:100%;border-radius:8px;border:1px solid #333;background:#222;color:#eee' required><p>Entry ₹:</p><input name='entry' type='number' step='0.01' style='padding:10px;width:100%;border-radius:8px;border:1px solid #333;background:#222;color:#eee' required><br><br><button style='padding:14px;width:100%;background:#00e89d;color:#000;border:none;border-radius:8px;font-weight:bold;font-size:16px;cursor:pointer'>Send</button></form></body></html>");
  const ep=parseFloat(entry),ad={stock_name:stock.toUpperCase(),entry_price:ep,target_price:Math.round(ep*1.3*100)/100,sl_price:Math.round(ep*0.85*100)/100};
  if(dbOk)await supabase.from("alerts_log").insert({...ad,strategy:"52-Week High Breakout"});
  const n=await sendAlertToUsers(ad);
  res.send("<html><body style='font-family:sans-serif;padding:40px;background:#111;color:#eee'><h2>✅ Sent!</h2><p>"+ad.stock_name+" → "+n+" users</p><a href='/api/send-alert?key="+key+"' style='color:#00e89d'>Send Another</a></body></html>");
});

console.log("Bot v4 with Cashfree ready!");
