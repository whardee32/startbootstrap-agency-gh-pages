const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors()); // ok for local dev; tighten later for production
app.use(express.json({ limit: "200kb" }));

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}
function isValidISODate(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso);
}
function validate(body) {
  const errors = [];

  const dates = body?.preferences?.dates;
  const windows = body?.preferences?.windows;

  if (!Array.isArray(dates) || dates.length < 1) errors.push("Select at least 1 day.");
  if (!Array.isArray(windows) || windows.length < 1) errors.push("Select at least 1 time window.");

  if (Array.isArray(dates)) {
    for (const d of dates) if (!isValidISODate(d)) errors.push(`Invalid date: ${d}`);
  }

  const allowedWindows = new Set(["morning", "afternoon", "evening"]);
  if (Array.isArray(windows)) {
    for (const w of windows) if (!allowedWindows.has(w)) errors.push(`Invalid window: ${w}`);
  }

  const name = (body?.customer?.name || "").trim();
  const phone = normalizePhone(body?.customer?.phone || "");
  const email = (body?.customer?.email || "").trim() || null;

  const line1 = (body?.address?.line1 || "").trim();
  const line2 = (body?.address?.line2 || "").trim() || null;
  const city = (body?.address?.city || "").trim();
  const state = (body?.address?.state || "").trim();
  const zip = (body?.address?.zip || "").trim();

  const notes = (body?.notes || "").trim() || null;

  if (!name) errors.push("Name is required.");
  if (!phone) errors.push("Phone is required.");
  if (!line1) errors.push("Street address is required.");
  if (!city) errors.push("City is required.");
  if (!state) errors.push("State is required.");
  if (!zip) errors.push("ZIP is required.");

  return {
    errors,
    cleaned: {
      preferences: { dates, windows },
      customer: { name, phone, email },
      address: { line1, line2, city, state, zip },
      notes
    }
  };
}

// Save new request
app.post("/api/booking-request", (req, res) => {
  const { errors, cleaned } = validate(req.body);
  if (errors.length) return res.status(400).json({ ok: false, errors });

  const { preferences, customer, address, notes } = cleaned;

  db.run(
    `
    INSERT INTO booking_requests
    (preferred_dates_json, preferred_windows_json, name, phone, email, line1, line2, city, state, zip, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
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
      notes
    ],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: "Database insert failed." });
      return res.json({ ok: true, request_id: this.lastID });
    }
  );
});

// Admin: list requests
app.get("/api/admin/requests", (req, res) => {
  const status = (req.query.status || "requested").trim();

  db.all(
    `
    SELECT * FROM booking_requests
    WHERE status = ?
    ORDER BY datetime(created_at) DESC
    LIMIT 500
    `,
    [status],
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: "Database read failed." });

      const out = rows.map(r => ({
        ...r,
        preferred_dates: JSON.parse(r.preferred_dates_json),
        preferred_windows: JSON.parse(r.preferred_windows_json),
      }));

      res.json({ ok: true, requests: out });
    }
  );
});

app.listen(PORT, () => {
  console.log(`API running: http://localhost:${PORT}`);
});
