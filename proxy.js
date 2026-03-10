const express = require("express");
const cors    = require("cors");

const app  = express();
const PORT = process.env.PORT || 3131;
const KEY  = process.env.ANTHROPIC_ADMIN_KEY;
const BASE = "https://api.anthropic.com/v1";

if (!KEY) {
  console.error("Set ANTHROPIC_ADMIN_KEY environment variable.");
  process.exit(1);
}

const HDR = {
  "x-api-key":          KEY,
  "anthropic-version":  "2023-06-01",
  "Content-Type":       "application/json",
};

app.use(cors());
app.use(express.json());

async function api(path) {
  const r = await fetch(`${BASE}${path}`, { headers: HDR });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  return r.json();
}

app.get("/",           (_, res) => res.json({ status: "ok" }));
app.get("/api/health", (_, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

app.get("/api/members", async (_, res) => {
  try {
    const d = await api("/organizations/members");
    const raw = d.data || d.members || [];
    res.json({
      members: raw.map(m => ({
        id:    m.id    || m.user?.id,
        name:  m.name  || m.user?.name  || "Unknown",
        email: m.email || m.user?.email || "",
        role:  m.role  || "Member",
      }))
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/usage", async (_, res) => {
  try {
    const now   = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
    const d     = await api(`/organizations/usage_report/claude_code?starting_at=${start}&limit=100`);
    const byUser = {};
    for (const row of (d.usage || d.data || [])) {
      const uid = row.user_id || row.id;
      if (!uid) continue;
      if (!byUser[uid]) byUser[uid] = { user_id:uid, prompts:0, tokens:0, projects:0, sessions:0, last_active:"Today" };
      byUser[uid].prompts  += row.prompts   || 0;
      byUser[uid].tokens   += row.tokens    || 0;
      byUser[uid].projects += row.projects  || 0;
      byUser[uid].sessions += row.sessions  || 0;
      if (row.last_active) byUser[uid].last_active = row.last_active;
    }
    res.json({ usage: Object.values(byUser) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/trend", async (_, res) => {
  try {
    const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d    = new Date(Date.now() - i * 86400000);
      const date = d.toISOString().slice(0, 10);
      const data = await api(`/organizations/usage_report/claude_code?starting_at=${date}&limit=100`);
      const total = (data.usage || data.data || []).reduce((s, r) => s + (r.prompts || 0), 0);
      days.push({ day: DAYS[d.getDay()], prompts: total });
    }
    res.json(days);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log("Proxy running on port " + PORT));
