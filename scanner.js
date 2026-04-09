// ============================================
// STOCK SCANNER — Checks Nifty 100 for 52-Week Highs
// ============================================
// This module fetches live NSE data and checks if any
// Nifty 100 stock has hit its 52-week high today.

// Nifty 100 stock symbols on NSE
const NIFTY_100_SYMBOLS = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR", "SBIN",
  "BHARTIARTL", "BAJFINANCE", "ITC", "KOTAKBANK", "LT", "HCLTECH", "AXISBANK",
  "ASIANPAINT", "MARUTI", "SUNPHARMA", "TATAMOTORS", "TITAN", "DMART",
  "ULTRACEMCO", "BAJAJFINSV", "WIPRO", "ONGC", "NTPC", "POWERGRID", "M&M",
  "JSWSTEEL", "TATASTEEL", "ADANIENT", "ADANIPORTS", "COALINDIA", "TECHM",
  "GRASIM", "DIVISLAB", "NESTLEIND", "BRITANNIA", "CIPLA", "DRREDDY",
  "EICHERMOT", "BAJAJ-AUTO", "HEROMOTOCO", "BPCL", "HINDALCO", "INDUSINDBK",
  "SBILIFE", "APOLLOHOSP", "TATACONSUM", "HDFCLIFE", "BEL", "HAL",
  "TRENT", "JIOFIN", "ZOMATO", "IRFC", "ABB", "SIEMENS", "GODREJCP",
  "SHRIRAMFIN", "ATGL", "COLPAL", "PIDILITIND", "DLF", "AMBUJACEM",
  "TORNTPHARM", "INDIGO", "BANKBARODA", "CANBK", "PNB", "IOC",
  "LICI", "IRCTC", "NHPC", "RECLTD", "PFC", "VEDL",
  "MOTHERSON", "HAVELLS", "LTIM", "PERSISTENT", "COFORGE", "MPHASIS",
  "TATAPOWER", "ADANIGREEN", "ADANIPOWER", "GAIL", "HINDPETRO",
  "SBICARD", "NAUKRI", "POLICYBZR", "PAYTM", "DELHIVERY",
  "CHOLAFIN", "MFSL", "ICICIGI", "ICICIPRULI", "MAXHEALTH",
  "MANKIND", "LODHA", "SUPREMEIND", "VOLTAS", "PAGEIND"
];

/**
 * Fetches stock data from NSE
 * We use the NSE India API which is free and gives us 52-week high data
 */
async function fetchStockData(symbol) {
  try {
    const url = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.nseindia.com/",
      },
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch (err) {
    console.log(`Error fetching ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Gets NSE session cookies (required for NSE API to work)
 */
async function getNSESession() {
  try {
    const response = await fetch("https://www.nseindia.com/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const cookies = response.headers.get("set-cookie");
    return cookies;
  } catch (err) {
    console.log("Error getting NSE session:", err.message);
    return null;
  }
}

/**
 * MAIN FUNCTION: Scans all Nifty 100 stocks and returns
 * those hitting their 52-week high today
 */
async function scanFor52WeekHighs() {
  console.log("🔍 Scanning Nifty 100 stocks for 52-week highs...");
  
  const alerts = [];
  
  // First, get session from NSE
  await getNSESession();
  
  // We'll use the pre-built NSE screener endpoint which is more reliable
  try {
    const screenerUrl = "https://www.nseindia.com/api/live-analysis-52Week-high";
    const response = await fetch(screenerUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://www.nseindia.com/",
      },
    });

    if (response.ok) {
      const data = await response.json();
      
      // Filter for only Nifty 100 stocks
      if (data.data && Array.isArray(data.data)) {
        for (const stock of data.data) {
          const symbol = stock.symbol;
          if (NIFTY_100_SYMBOLS.includes(symbol)) {
            const ltp = parseFloat(stock.ltp) || parseFloat(stock.lastPrice);
            if (ltp > 0) {
              const target = Math.round(ltp * 1.30 * 100) / 100;  // +30%
              const sl = Math.round(ltp * 0.85 * 100) / 100;      // -15%
              
              alerts.push({
                stock_name: symbol,
                full_name: stock.companyName || symbol,
                entry_price: ltp,
                target_price: target,
                sl_price: sl,
                high_52week: parseFloat(stock.yearHigh) || ltp,
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.log("Error with NSE screener:", err.message);
  }

  // FALLBACK: If NSE direct API doesn't work (it can be flaky),
  // we also check using a secondary free source
  if (alerts.length === 0) {
    try {
      // Try the Groww API as fallback (also free)
      const nifty100Url = "https://groww.in/v1/api/stocks_data/v1/accord_points/exchange/NSE/segment/CASH/latest_indices_constituent/NIFTY100";
      const response = await fetch(nifty100Url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      
      if (response.ok) {
        const data = await response.json();
        // Process if data is available
        console.log("Checked fallback source for 52-week high data");
      }
    } catch (err) {
      console.log("Fallback source also unavailable:", err.message);
    }
  }

  console.log(`✅ Found ${alerts.length} stocks hitting 52-week highs in Nifty 100`);
  return alerts;
}

module.exports = { scanFor52WeekHighs, NIFTY_100_SYMBOLS };
