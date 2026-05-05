# FORGE - File Output for Ramp Generated Examples

An internal application for creating demo asset files (invoices, receipts, quotes, and contracts) based on company domain analysis.

## Features

- **Domain Analysis**: Enter a company domain to automatically fetch and analyze company information
- **AI-Powered Content**: Generate realistic asset content based on company profile
- **Multiple Asset Types**: Create invoices, receipts, quotes, and contracts
- **Visual Editor**: Edit generated assets with an intuitive visual interface
- **Export Options**: Download assets as JPG or PDF

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express, TypeScript
- **AI (text)**: Anthropic Claude Opus 4.7 (asset/receipt generation + domain enrichment via the hosted `web_search` tool)
- **AI (images)**: Google Gemini (paper-receipt photorealistic image generation)
- **Logos**: logo.dev (publishable token)
- **Export**: Browser-side PDF/JPG via [`html-to-image`](https://github.com/bubkoo/html-to-image) + [`pdf-lib`](https://pdf-lib.js.org/) — captures the same React templates the editor renders, no headless browser on the server

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- npm 10.x or higher

### Installation

```bash
# Install all dependencies
npm run install:all

# Or install individually
cd client && npm install
cd ../server && npm install
```

### Environment Variables (Required)

Create a `.env` file in the `server` directory with your API keys:

```env
PORT=3001
ANTHROPIC_API_KEY=your_anthropic_api_key
GEMINI_API_KEY=your_gemini_api_key
LOGO_DEV_KEY=your_logo_dev_publishable_key
DATABASE_URL=postgres://user:pass@host:5432/dbname  # provided by Ramplify in prod
```

**Note:** Required keys:
- **Anthropic API Key**: Used for company enrichment (via Claude's hosted `web_search` tool) and all text-asset generation. Get one at [console.anthropic.com](https://console.anthropic.com).
- **Gemini API Key**: Used only for paper-receipt photorealistic image generation. Get one at [aistudio.google.com](https://aistudio.google.com).
- **Logo.dev Key**: Publishable (`pk_*`) token used to render company/vendor logos in PDFs and the editor. Get one at [logo.dev](https://logo.dev).
- **Database URL**: Postgres connection string for analytics. In production this is provided automatically by Ramplify when the app's managed database is enabled. Leave blank locally to disable analytics — the app will still run, just without `generation_events` persistence.

The client also reads `VITE_LOGO_DEV_KEY` at build time (set in GitHub Actions Variables for deploys).

### Development

```bash
# Run both client and server
npm run dev

# Or run separately
npm run dev:client  # Runs on http://localhost:5173
npm run dev:server  # Runs on http://localhost:3001
```

### Build

```bash
npm run build
```

## Project Structure

```
forge/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/        # UI components
│   │   ├── hooks/             # Custom hooks
│   │   ├── services/          # API calls + capture pipeline
│   │   │   ├── api.ts         # JSON HTTP + SSE streaming
│   │   │   └── capture.ts     # Browser PDF/JPG capture (html-to-image + pdf-lib)
│   │   ├── templates/         # Asset templates (also rendered for export capture)
│   │   ├── types/             # TypeScript types
│   │   └── styles/            # Global styles
│   └── ...
├── server/                    # Express backend (JSON only — no PDF/JPG rendering)
│   ├── src/
│   │   ├── routes/            # /api/enrich, /api/generate, /api/v1/*
│   │   └── services/          # Claude, Gemini, enrichment, analytics
│   └── ...
└── README.md
```

## Export Pipeline

PDF and JPG export run entirely in the browser:

1. The user's selected asset is rendered off-screen at native size by `AssetPreview`.
2. `services/capture.ts` waits for fonts and logos to settle, then:
   - **PDF**: rasterizes the DOM with `html-to-image` at 2x DPI and embeds the PNG into a single A4-width page via `pdf-lib`, with full AI provenance metadata.
   - **JPG**: writes a 95-quality JPEG with EXIF tags via `piexifjs` (Copyright, ImageDescription, Software, Artist).

The server has no headless browser, no `puppeteer-core`, no chromium download, and no `/api/export` route. The `/api/v1/*` API is JSON-only and returns structured `AssetData`; consumers wanting visual files render them client-side.

## Brand Guidelines

This application follows Ramp brand guidelines:

- **Typography**: Lausanne font family (400, 700 weights)
- **Primary Colors**: White (#FFFFFF), Slate (#3D3D3D), Sand (#F4F3EF)
- **Accent Color**: Solar (#E4F222) - used sparingly

## License

Internal use only - Ramp proprietary
