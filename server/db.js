const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(__dirname, "routine_relief.db");
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON;");

  db.run(`
    CREATE TABLE IF NOT EXISTS booking_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),

      preferred_dates_json TEXT NOT NULL,
      preferred_windows_json TEXT NOT NULL,

      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,

      line1 TEXT NOT NULL,
      line2 TEXT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip TEXT NOT NULL,

      notes TEXT,
      status TEXT NOT NULL DEFAULT 'requested' -- requested | scheduled | cancelled
    );
  `);
});

module.exports = db;
