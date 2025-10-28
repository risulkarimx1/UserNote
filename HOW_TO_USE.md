# Logbook - How to Use

A sleek web logbook application that uses Ollama to automatically improve your log entries.

## Prerequisites

- Node.js 18+ installed
- Ollama installed and running

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

4. **Use the interface:**
   - **New Entry Tab**: Type your thoughts and click "Create Entry"
   - **All Logs Tab**: View, edit, or delete existing logs
   - All entries are automatically improved by Ollama

## Features

- **Modern Design**: Sleek black and white interface with smooth animations
- **Two Tabs**:
  - **New Entry**: Simple text input for creating new logs
  - **All Logs**: View all your entries with edit/delete options
- **Real-time Feedback**: Loading states and success messages
- **Keyboard Shortcuts**: Press `Cmd+Enter` (Mac) or `Ctrl+Enter` (Windows/Linux) to submit
- **Responsive**: Works on desktop and mobile browsers
- **Auto-save**: All changes are immediately saved to `logs.md`

## Technology Stack

- **Backend**: TypeScript + Express
- **AI**: Ollama (llama3.2) for text improvement
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Storage**: Markdown file (`logs.md`)
- **No API keys**: Runs 100% locally

## File Structure

- `src/server.ts` - Express server
- `templates/index.html` - Web interface
- `logs.md` - Your log entries (auto-generated)
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration

## Troubleshooting

**Dependencies not installing:**
- Make sure Node.js 18+ is installed: `node --version`
- Delete `node_modules` and run `npm install` again

**Ollama not found:**
- Make sure Ollama is installed: `brew install ollama` (macOS)
- Check if it's running: `ollama list`

**Model not available:**
- The default model is `llama3.2:latest`
- Download it: `ollama pull llama3.2`
- Or edit `src/server.ts` line 20 to use a different model

**Port 3000 already in use:**
- Change the port in `src/server.ts` line 7

**Logs not saving:**
- Check file permissions in the current directory
- Logs are saved to `logs.md` in the same folder

**Web page not loading:**
- Make sure `npm run dev` is running
- Check the terminal for any error messages
- Try accessing `http://127.0.0.1:3000` instead

## Build for Production

```bash
npm run build
npm start
```
