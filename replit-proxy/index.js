// ═══════════════════════════════════════════════════════════════
// VdL Farm — Organization Network Map API Proxy
// 
// This small server sits between the browser app and Notion's API.
// It queries your Notion databases (Circles, People, Roles) and
// returns clean graph data (nodes + edges) for the D3 visualization.
//
// Deploy on Replit as a Node.js project.
// Set the NOTION_API_KEY secret in Replit's Secrets tab.
// ═══════════════════════════════════════════════════════════════

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// Allow requests from GitHub Pages and localhost
app.use(cors({
  origin: [
    "https://ludwa6.github.io",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
  ],
  methods: ["GET"],
}));

app.use(express.json());

// --- Notion Config ---
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

const DB_IDS = {
  circles: "2de36f74-3758-8122-ac4a-000b520202bf",
  people: "c2edc051-62cd-49cb-9805-38fa64d83a4f",
  roles: "2de36f74-3758-8123-8fda-000b5d5af434",
};

function notionHeaders() {
  return {
    "Authorization": `Bearer ${process.env.NOTION_API_KEY}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function queryDatabase(databaseId, filter = undefined) {
  const body = { page_size: 100 };
  if (filter) body.filter = filter;
  const res = await fetch(`${NOTION_API}/databases/${databaseId}/query`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion API error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.results;
}

function extractText(prop) {
  if (!prop) return "";
  if (prop.type === "title" && prop.title?.length > 0) return prop.title.map(t => t.plain_text).join("");
  if (prop.type === "rich_text" && prop.rich_text?.length > 0) return prop.rich_text.map(t => t.plain_text).join("");
  return "";
}

function extractRelationIds(prop) {
  if (!prop || prop.type !== "relation") return [];
  return prop.relation.map(r => r.id);
}

function extractSelect(prop) {
  if (!prop || prop.type !== "select" || !prop.select) return null;
  return prop.select.name;
}

async function buildGraphData() {
  const [circlePages, peoplePages] = await Promise.all([
    queryDatabase(DB_IDS.circles),
    queryDatabase(DB_IDS.people),
  ]);

  const nodes = [];
  const edges = [];
  const circleIdMap = {};
  const personIdMap = {};

  circlePages.forEach((page, i) => {
    const props = page.properties;
    const name = extractText(props["Name"]);
    if (name === "Circle [Name]") return;
    const shortId = `circle-${i}`;
    circleIdMap[page.id] = shortId;
    nodes.push({
      id: shortId, notionId: page.id, name,
      purpose: extractText(props["Purpose"]),
      status: extractSelect(props["Status"]) || "Active",
      nodeType: "circle", level: extractRelationIds(props["Super-circle"]).length > 0 ? 1 : 0,
      superCircleNotionIds: extractRelationIds(props["Super-circle"]),
      circleLeadRoleNotionIds: extractRelationIds(props["Circle Lead"]),
      circleRepRoleNotionIds: extractRelationIds(props["Circle Rep"]),
    });
  });

  const notionToNode = {};
  nodes.forEach(n => { notionToNode[n.notionId] = n; });
  nodes.forEach(n => {
    if (n.nodeType !== "circle") return;
    if (n.superCircleNotionIds.length === 0) { n.level = 0; }
    else {
      const parent = notionToNode[n.superCircleNotionIds[0]];
      n.level = (parent && parent.superCircleNotionIds.length === 0) ? 1 : 2;
    }
  });

  peoplePages.forEach((page, i) => {
    const props = page.properties;
    const shortId = `person-${i}`;
    personIdMap[page.id] = shortId;
    nodes.push({
      id: shortId, notionId: page.id,
      name: extractText(props["First Name"]) || extractText(props["Name"]),
      fullName: extractText(props["Name"]),
      status: extractSelect(props["Person Status"]) || "Active",
      nodeType: "person",
      circleMembershipNotionIds: extractRelationIds(props["Circle Memberships"]),
      roleNotionIds: extractRelationIds(props["Roles"]),
    });
  });

  // Sub-circle edges
  nodes.filter(n => n.nodeType === "circle").forEach(n => {
    (n.superCircleNotionIds || []).forEach(pid => {
      if (circleIdMap[pid]) edges.push({ source: n.id, target: circleIdMap[pid], type: "subcircle", label: "Sub-circle of" });
    });
  });

  // Lead & Rep edges
  nodes.filter(n => n.nodeType === "circle").forEach(cn => {
    (cn.circleLeadRoleNotionIds || []).forEach(rid => {
      nodes.filter(p => p.nodeType === "person").forEach(p => {
        if ((p.roleNotionIds || []).includes(rid)) edges.push({ source: p.id, target: cn.id, type: "leads", label: "Circle Lead" });
      });
    });
    (cn.circleRepRoleNotionIds || []).forEach(rid => {
      nodes.filter(p => p.nodeType === "person").forEach(p => {
        if ((p.roleNotionIds || []).includes(rid)) edges.push({ source: p.id, target: cn.id, type: "represents", label: "Circle Rep" });
      });
    });
  });

  // Membership edges
  nodes.filter(n => n.nodeType === "person").forEach(p => {
    (p.circleMembershipNotionIds || []).forEach(cid => {
      const circleId = circleIdMap[cid];
      if (circleId && !edges.some(e => e.source === p.id && e.target === circleId && (e.type === "leads" || e.type === "represents"))) {
        edges.push({ source: p.id, target: circleId, type: "energizes", label: "Member" });
      }
    });
  });

  const cleanNodes = nodes.map(n => ({
    id: n.id, name: n.name, fullName: n.fullName || n.name,
    purpose: n.purpose || "", status: n.status, nodeType: n.nodeType, level: n.level,
    notionUrl: `https://notion.so/${n.notionId.replace(/-/g, "")}`,
  }));

  return {
    nodes: cleanNodes, edges,
    meta: {
      circleCount: cleanNodes.filter(n => n.nodeType === "circle").length,
      personCount: cleanNodes.filter(n => n.nodeType === "person").length,
      edgeCount: edges.length,
      timestamp: new Date().toISOString(),
      source: "Notion API - live query",
    },
  };
}

app.get("/", (req, res) => {
  res.json({ service: "VdL Farm OrgMap API", status: "running", endpoints: { "/api/graph": "GET - graph data", "/api/health": "GET - health check" } });
});

app.get("/api/graph", async (req, res) => {
  try {
    const data = await buildGraphData();
    res.set("Cache-Control", "public, max-age=60");
    res.json(data);
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Failed to fetch graph data", message: err.message });
  }
});

app.get("/api/health", async (req, res) => {
  try {
    const testRes = await fetch(`${NOTION_API}/databases/${DB_IDS.circles}`, { headers: notionHeaders() });
    res.json({ status: "healthy", notion: testRes.ok ? "connected" : "error", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`VdL OrgMap API running on port ${PORT}`);
  if (!process.env.NOTION_API_KEY) console.warn("NOTION_API_KEY not set! Add it in Replit Secrets.");
});
