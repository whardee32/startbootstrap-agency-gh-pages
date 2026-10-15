console.log("Starting Routine Relief scheduling API");

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
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  query_timeout: 8000,
  statement_timeout: 8000,
  max: 5,
  // Supabase + hosted Postgres typically requires SSL in production
  ssl: { rejectUnauthorized: false },
});
pool.on("error", () => console.error("Unexpected idle database connection error"));

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
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
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

  const name = String(body?.customer?.name || "").trim();
  const phone = normalizePhone(body?.customer?.phone || "");
  const email = String(body?.customer?.email || "").trim() || null;

  const line1 = String(body?.address?.line1 || "").trim();
  const line2 = String(body?.address?.line2 || "").trim() || null;
  const city = String(body?.address?.city || "").trim();
  const state = String(body?.address?.state || "").trim() || "UT";
  const zip = String(body?.address?.zip || "").trim();

  const notes = String(body?.notes || "").trim() || null;

  if (!name) errors.push("Name is required.");
  if (!/^(?:1)?\d{10}$/.test(phone)) errors.push("Enter a valid 10-digit phone number.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("Enter a valid email address.");
  if (!line1) errors.push("Street address is required.");
  if (!city) errors.push("City is required.");
  if (!/^\d{5}(?:-\d{4})?$/.test(zip)) errors.push("Enter a valid ZIP code.");
  if (state !== "UT") errors.push("Service is currently available in Utah only.");
  if (name.length > 100 || line1.length > 200 || city.length > 100 || notes?.length > 2000) errors.push("Some fields are too long.");
  if (Array.isArray(dates) && dates.length > 21) errors.push("Choose no more than 21 preferred days.");
  if (Array.isArray(windows) && windows.length > 3) errors.push("Choose no more than 3 time windows.");

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

/* Lightweight liveness check; readiness below includes the database. */
app.get("/healthz", (req, res) => res.json({ ok: true }));

/* Health check */
app.get("/api/health", async (req, res) => {
  try {
    const r = await pool.query("select now() as now");
    res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    console.error("Database readiness check failed:", e.code || e.name);
    res.status(503).json({ ok: false, error: "Scheduling is temporarily unavailable. Please email routinereliefsystems@gmail.com." });
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
    console.error("Booking insert failed:", err.code || err.name);
    return res.status(500).json({
      ok: false,
      error: "We could not save this request. Please email routinereliefsystems@gmail.com.",
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
    console.error("Admin read failed:", err.code || err.name);
    return res.status(500).json({
      ok: false,
      error: "Database request failed",
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
    console.error("Admin update failed:", err.code || err.name);
    return res.status(500).json({
      ok: false,
      error: "Database update failed",
    });
  }
});

/* ======================
   START SERVER
====================== */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on port ${PORT}`);
});