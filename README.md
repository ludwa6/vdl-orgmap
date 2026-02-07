# VdL Farm — Organization Network Map

Interactive D3.js visualization of Quinta Vale da Lama's Holacracy governance structure, powered by live data from Notion.

## Architecture

```
Browser → GitHub Pages (static HTML/JS/D3)
              ↓
         Replit Proxy (Node.js/Express)
              ↓
         Notion API (Circles, People, Roles databases)
```

## Components

### GitHub Pages App (`index.html`)
- Single self-contained HTML file with embedded CSS and JavaScript
- D3.js force-directed graph visualization
- Interactive features: drag, zoom, search, filter, detail panel
- Falls back gracefully to static data if API proxy is unavailable

### Replit API Proxy (`replit-proxy/`)
- Lightweight Express server that bridges Notion API to the browser
- Handles CORS, data transformation, and caching
- Endpoint: `GET /api/graph` — returns nodes and edges as JSON
- Requires `NOTION_API_KEY` secret in Replit

## Setup

### 1. Deploy the Replit Proxy
1. Create a new Node.js Replit
2. Upload `replit-proxy/index.js` and `replit-proxy/package.json`
3. Add your Notion integration token as `NOTION_API_KEY` in Replit Secrets
4. Deploy — note the URL (e.g., `https://vdl-orgmap-api.replit.app`)

### 2. Update the App
1. In `index.html`, update `API_URL` to your Replit deployment URL
2. Push to GitHub, enable GitHub Pages

### 3. Embed in Notion (optional)
Add an embed block in any Notion page pointing to:
`https://ludwa6.github.io/vdl-orgmap/`

## Notion Integration Requirements
The Notion integration needs access to these databases:
- **Circles** (2de36f74-3758-8122-ac4a-000b520202bf)
- **People** (c2edc051-62cd-49cb-9805-38fa64d83a4f)
- **Roles** (2de36f74-3758-8123-8fda-000b5d5af434)

## License
Internal tool for Quinta Vale da Lama.
