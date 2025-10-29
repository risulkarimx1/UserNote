# UserLog

A modern, AI-powered multi-notebook logging application that helps you capture and organize your thoughts with automatic text improvement using Ollama.

## Features

- **Multiple Notebooks**: Organize your logs into separate notebooks for different projects or topics
- **AI-Powered Text Improvement**: Automatically enhance your entries with grammar fixes and better readability using Ollama
- **Image Attachments**: Add images to your log entries (supports PNG, JPEG, GIF, WebP)
- **Two Entry Modes**:
  - **Improve**: AI enhances your text for clarity and grammar
  - **Save**: Save your entry as-is without AI modification
- **Modern UI**: Clean, monospace design with collapsible sidebar
- **Export to Markdown**: Download your entire notebook as a markdown file with embedded images
- **Local-First**: All data stored locally in JSON format, no cloud services required
- **No API Keys**: Runs completely offline using local Ollama

## Prerequisites

- Node.js 18+ installed
- [Ollama](https://ollama.ai) installed and running
- `llama3.2:latest` model (or modify `src/server.ts:58` to use a different model)

## Setup

### 1. Install Node.js

If you don't have Node.js installed:

**macOS:**
```bash
brew install node
```

**Windows:**
Download from [nodejs.org](https://nodejs.org)

**Linux:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verify installation:
```bash
node --version  # Should be 18 or higher
npm --version
```

### 2. Install Ollama

**macOS:**
```bash
brew install ollama
```

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:**
Download from [ollama.ai](https://ollama.ai)

### 3. Pull the AI Model

```bash
ollama pull llama3.2
```

Verify Ollama is running:
```bash
ollama list  # Should show llama3.2:latest
```

### 4. Clone the Repository

```bash
git clone https://github.com/risulkarimx1/UserNote.git
cd UserNote
```

### 5. Install Dependencies

```bash
npm install
```

### 6. Start the Application

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

### 7. Open in Browser

Navigate to `http://localhost:3000` and start logging!

## How It Works

1. **Create Notebooks**: Click "New Notebook" in the sidebar to create different notebooks
2. **Add Entries**: Type your thoughts in the text area
3. **Choose Mode**:
   - Click **Improve** to have AI enhance your text
   - Click **Save** to keep it as-is
4. **Attach Images**: Paste images directly into your entries
5. **Manage Logs**: Edit or delete entries from the history view
6. **Export**: Download your notebook as a markdown file

## Data Storage

- Notebooks are stored in `data/notebooks/` as JSON files
- Image attachments are saved in `data/notebooks/{notebook-slug}/attachments/`
- Each notebook has its own isolated storage

## Keyboard Shortcuts

- `Cmd+Enter` (Mac) / `Ctrl+Enter` (Windows/Linux): Submit entry with AI improvement

## API Endpoints

### Notebooks
- `GET /api/notebooks` - List all notebooks
- `POST /api/notebooks` - Create a new notebook
- `DELETE /api/notebooks/:slug` - Delete a notebook
- `GET /api/notebooks/:slug/export` - Export notebook as markdown

### Logs
- `GET /api/notebooks/:slug/logs` - Get all logs for a notebook
- `POST /api/notebooks/:slug/logs` - Create a new log entry
- `PUT /api/notebooks/:slug/logs/:id` - Edit a log entry
- `DELETE /api/notebooks/:slug/logs/:id` - Delete a log entry

### Attachments
- `GET /api/notebooks/:slug/attachments/:filename` - Retrieve an attachment

## Configuration

- **Port**: Change in `src/server.ts:7` (default: 3000)
- **AI Model**: Change in `src/server.ts:58` (default: llama3.2:latest)
- **Data Directory**: Change in `NotebookManager` constructor (default: data/notebooks)
- **Max Upload Size**: 25MB (configured in `src/server.ts:501-502`)

## Troubleshooting

### Ollama not found
```bash
# macOS
brew install ollama

# Pull the model
ollama pull llama3.2
```

### Port already in use
Change the port in `src/server.ts:7`

### Images not uploading
Check that you're not exceeding the 25MB limit for attachments

## Technology Stack

- **Backend**: TypeScript, Express.js
- **AI**: Ollama (llama3.2)
- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Storage**: JSON files + filesystem for attachments

## License

MIT
