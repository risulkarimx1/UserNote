# UserLog

A modern, AI-powered multi-notebook logging application that helps you capture and organize your thoughts with automatic text improvement using Ollama.

## Features

- AI-powered text improvement using local Ollama models
- Multiple notebooks for organization
- Image attachments support
- One-click PDF export with embedded screenshots
- Local-first storage (no cloud required)
- Clean, modern UI with collapsible sidebar

## Setup

### Prerequisites
- Node.js 18+
- [Ollama](https://ollama.ai) installed and running

### Installation

1. Install dependencies:
```bash
npm install
```

2. Install Ollama model:
```bash
ollama pull llama3.2
```

### Run

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

Open `http://localhost:3000` in your browser to start logging!

### PDF Export

Select a notebook and use the **Export** button in the top toolbar to download a PDF that includes your entries and embedded screenshots.
