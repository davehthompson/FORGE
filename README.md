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
- **AI**: OpenAI GPT-4
- **Company Data**: Clearbit/Apollo Enrichment API

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
OPENAI_API_KEY=your_openai_api_key
PDL_API_KEY=your_pdl_api_key
```

**Note:** Both API keys are required for the application to function:
- **PDL API Key**: Used to fetch company information from domains via People Data Labs. Get one at [peopledatalabs.com](https://www.peopledatalabs.com)
- **OpenAI API Key**: Used to generate realistic asset content. Get one at [platform.openai.com](https://platform.openai.com)

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
│   │   ├── services/          # API calls
│   │   ├── templates/         # Asset templates
│   │   ├── types/             # TypeScript types
│   │   └── styles/            # Global styles
│   └── ...
├── server/                    # Express backend
│   ├── src/
│   │   ├── routes/            # API routes
│   │   ├── services/          # Business logic
│   │   └── templates/         # Asset templates
│   └── ...
└── README.md
```

## Brand Guidelines

This application follows Ramp brand guidelines:

- **Typography**: Lausanne font family (400, 700 weights)
- **Primary Colors**: White (#FFFFFF), Slate (#3D3D3D), Sand (#F4F3EF)
- **Accent Color**: Solar (#E4F222) - used sparingly

## License

Internal use only - Ramp proprietary
