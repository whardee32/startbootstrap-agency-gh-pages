console.log("RUNNING THE NEW POSTGRES SERVER.JS ✅");

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3001;

/* ======================
   DATABASE (Supabase)
====================== */
if (!process.env.DATABASE_URL) {
  console.warn(
    "⚠️ DATABASE_URL is missing. The API will not be able to connect to Postgres."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase + hosted Postgres typically requires SSL in production
  ssl: { rejectUnauthorized: false },
});

/* ======================
   MIDDLEWARE
====================== */
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "https://routinerelief.com",
  "https://www.routinerelief.com",
  // If you use GitHub pages, add the exact origin:
  // "https://whardee32.github.io"
];

app.use(
  cors({
    origin: (origin, cb) => {
      // allow curl/postman/no-origin requests
      if (!origin) return cb(null, true);

      if (allowedOrigins.includes(origin)) return cb(null, true);

      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);

app.use(express.json({ limit: "200kb" }));

/* ======================
   HELPERS
====================== */
function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isValidISODate(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso);
}

function validateBooking(body) {
  const errors = [];

  const dates = body?.preferences?.dates;
  const windows = body?.preferences?.windows;

  if (!Array.isArray(dates) || dates.length < 1) {
    errors.push("Select at least 1 preferred day.");
  }

  if (!Array.isArray(windows) || windows.length < 1) {
    errors.push("Select at least 1 time window.");
  }

  if (Array.isArray(dates)) {
    for (const d of dates) {
      if (!isValidISODate(d)) errors.push(`Invalid date: ${d}`);
    }
  }

  const allowedWindows = new Set(["morning", "afternoon", "evening"]);
  if (Array.isArray(windows)) {
    for (const w of windows) {
      if (!allowedWindows.has(w)) errors.push(`Invalid window: ${w}`);
    }
  }

  const name = (body?.customer?.name || "").trim();
  const phone = normalizePhone(body?.customer?.phone || "");
  const email = (body?.customer?.email || "").trim() || null;

  const line1 = (body?.address?.line1 || "").trim();
  const line2 = (body?.address?.line2 || "").trim() || null;
  const city = (body?.address?.city || "").trim();
  const state = (body?.address?.state || "").trim() || "UT";
  const zip = (body?.address?.zip || "").trim();

  const notes = (body?.notes || "").trim() || null;

  if (!name) errors.push("Name is required.");
  if (!phone) errors.push("Phone is required.");
  if (!line1) errors.push("Street address is required.");
  if (!city) errors.push("City is required.");
  if (!zip) errors.push("ZIP is required.");

  return {
    errors,
    cleaned: {
      preferences: { dates: dates || [], windows: windows || [] },
      customer: { name, phone, email },
      address: { line1, line2, city, state, zip },
      notes,
    },
  };
}

function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

/* ======================
   ROUTES
====================== */

/* Health check */
app.get("/api/health", async (req, res) => {
  try {
    const r = await pool.query("select now() as now");
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    console.error("Health check failed:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* Create booking request */
app.post("/api/booking-request", async (req, res) => {
  const { errors, cleaned } = validateBooking(req.body);
  if (errors.length) {
    return res.status(400).json({ ok: false, errors });
  }

  const { preferences, customer, address, notes } = cleaned;

  try {
    const result = await pool.query(
      `
      INSERT INTO booking_requests
      (
        preferred_dates,
        preferred_windows,
        name,
        phone,
        email,
        line1,
        line2,
        city,
        state,
        zip,
        notes
      )
      VALUES ($1::jsonb,$2::jsonb,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id
      `,
      [
        // store arrays as jsonb
        JSON.stringify(preferences.dates),
        JSON.stringify(preferences.windows),
        customer.name,
        customer.phone,
        customer.email,
        address.line1,
        address.line2,
        address.city,
        address.state,
        address.zip,
        notes,
      ]
    );

    return res.json({ ok: true, request_id: result.rows[0].id });
  } catch (err) {
    console.error("Insert failed:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Database insert failed",
    });
  }
});

/* Admin list */
app.get("/api/admin/requests", requireAdmin, async (req, res) => {
  const status = String(req.query.status || "requested").trim();

  try {
    const r = await pool.query(
      `
      SELECT *
      FROM booking_requests
      WHERE status = $1
      ORDER BY created_at DESC
      LIMIT 500
      `,
      [status]
    );

    return res.json({ ok: true, requests: r.rows });
  } catch (err) {
    console.error("Admin read failed:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Database read failed",
    });
  }
});

/* Admin update status */
app.patch("/api/admin/requests/:id", requireAdmin, async (req, res) => {
  const id = req.params.id;
  const status = String(req.body?.status || "").trim();

  const allowed = new Set(["requested", "scheduled", "cancelled"]);
  if (!allowed.has(status)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid status. Use: requested | scheduled | cancelled",
    });
  }

  try {
    const r = await pool.query(
      `UPDATE booking_requests SET status = $1 WHERE id = $2 RETURNING id`,
      [status, id]
    );

    if (!r.rowCount) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Admin update failed:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Database update failed",
    });
  }
});

/* ======================
   START SERVER
====================== */
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});