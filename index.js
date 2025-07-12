const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const UAParser = require("ua-parser-js");
const mysql = require("mysql2");
const http = require("http");
require("dotenv").config();

const app = express(); // ✅ DEFINE APP FIRST
const server = http.createServer(app);

const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const PORT = 5000;
const IPINFO_TOKEN = process.env.IPINFO_TOKEN;

// ✅ MySQL setup
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "trackerdb",
});

db.connect((err) => {
  if (err) {
    console.error("❌ MySQL connection failed:", err.message);
  } else {
    console.log("✅ Connected to MySQL");
  }
});

app.use(cors());
app.use(express.json());

// ✅ Handle socket connections
io.on("connection", (socket) => {
  console.log("📡 Dashboard connected via Socket:", socket.id);
});

// ✅ Track visitor API
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
    ip = ""; // Let ipinfo.io auto-detect
  }

  try {
    // 🌐 Geo IP lookup
    const geoRes = await axios.get(`https://ipinfo.io/${ip}?token=${IPINFO_TOKEN}`);
    const geoData = geoRes.data;

    // 🧠 Parse user agent
    const parser = new UAParser(userAgent);
    const ua = parser.getResult();

    const id = uuidv4();
    const deviceId = uuidv4();
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");

    const visitorData = {
      id,
      asset_id: assetId,
      ad_account_id: adAccountId,
      target_url: targetUrl,
      session_id: sessionId,
      session_start: new Date(sessionStart).toISOString().slice(0, 19).replace("T", " "),
      timestamp,
      ip: geoData.ip,
      hostname: geoData.hostname,
      city: geoData.city,
      region: geoData.region,
      country: geoData.country,
      loc: geoData.loc,
      org: geoData.org,
      timezone: geoData.timezone,
      device_id: deviceId,
      device_type: ua.device.type || "Desktop",
      os: ua.os.name + " " + ua.os.version,
      browser: ua.browser.name + " " + ua.browser.version,
      utm_source: utmParams?.utm_source || null,
      utm_medium: utmParams?.utm_medium || null,
      gclid: utmParams?.gclid || null,
      fbclid: utmParams?.fbclid || null,
    };

    console.log("📝 Inserting into DB:", visitorData);

    const sql = "INSERT INTO visitors SET ?";
    db.query(sql, visitorData, (err, result) => {
      if (err) {
        console.error("❌ MySQL Insert Error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      console.log("✅ Visitor saved to DB");

      // 📢 Send to frontend in real-time
      io.emit("new-visitor", visitorData);

      return res.status(200).json({ status: "success", data: visitorData });
    });
  } catch (err) {
    console.error("❌ Geo Lookup Failed:", err.message);
    res.status(500).json({ error: "Geo lookup failed" });
  }
});

// ✅ Get all visitors
app.get("/api/visitors", (req, res) => {
  db.query("SELECT * FROM visitors ORDER BY timestamp DESC", (err, results) => {
    if (err) {
      console.error("❌ Failed to fetch data:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.status(200).json(results);
  });
});

// ✅ Start server
server.listen(PORT, () =>
  console.log(`🚀 Backend server running at http://localhost:${PORT}`)
);
