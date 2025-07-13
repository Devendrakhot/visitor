// Required modules
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const UAParser = require("ua-parser-js");
const http = require("http");
const db = require("./db"); // Make sure db.js is configured correctly
require("dotenv").config(); // Load environment variables

// App setup
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const IPINFO_TOKEN = process.env.IPINFO_TOKEN;

// Socket.IO setup
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("📡 Dashboard connected via Socket:", socket.id);
});

// Track visitor
app.post("/api/track", async (req, res) => {
  const {
    userAgent,
    utmParams,
    targetUrl,
    assetId,
    adAccountId,
    sessionId,
    sessionStart,
  } = req.body;

  let ip =
    req.headers["x-forwarded-for"] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress;
  ip = ip.split(",")[0].trim();

  if (ip === "::1" || ip.startsWith("127.") || ip.startsWith("::ffff:127")) {
    ip = "";
  }

  try {
    const geoRes = await axios.get(`https://ipinfo.io/${ip}?token=${IPINFO_TOKEN}`);
    const geoData = geoRes.data;

    const parser = new UAParser(userAgent);
    const ua = parser.getResult();

    const id = uuidv4();
    const deviceId = uuidv4();
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const session_start = new Date(sessionStart).toISOString().slice(0, 19).replace("T", " ");
const isp = geoData.org?.split(" ").slice(1).join(" ");
    const values = [
      id,
      assetId,
      adAccountId,
      targetUrl,
      sessionId,
      session_start,
      timestamp,
      geoData.ip,
      geoData.hostname,
      geoData.city,
      geoData.region,
      geoData.country,
      geoData.loc,
      geoData.org,
      geoData.timezone,
      deviceId,
      
      ua.device.type || "Desktop",
      ua.os.name + " " + ua.os.version,
      ua.browser.name + " " + ua.browser.version,
      utmParams?.utm_source || null,
      utmParams?.utm_medium || null,
      utmParams?.gclid || null,
      utmParams?.fbclid || null,
       geoData.postal ,
    ];

    const insertSQL = `
      INSERT INTO visitors (
        id, asset_id, ad_account_id, target_url, session_id, session_start, timestamp,
        ip, hostname, city, region, country, loc, org, timezone,
        device_id, device_type, os, browser,
        utm_source, utm_medium, gclid, fbclid,zip
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23,$24
      ) RETURNING *;
    `;

    const result = await db.query(insertSQL, values);
    const insertedVisitor = result.rows[0];
    io.emit("new-visitor", insertedVisitor);

    return res.status(200).json({ status: "success", data: insertedVisitor });
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fetch visitors
app.get("/api/visitors", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM visitors ORDER BY timestamp DESC");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("❌ Fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Backend server running at http://localhost:${PORT}`);
});
