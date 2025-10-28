import express, { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { Ollama } from 'ollama';

const app = express();
const PORT = 3000;

interface Log {
  id: number;
  date: string;
  text: string;
}

class Logbook {
  private logs: Map<number, Log> = new Map();
  private nextId: number = 1;
  private mdFile: string;
  private model: string;
  private ollama: Ollama;

  constructor(mdFile: string = 'logs.md', model: string = 'llama3.2:latest') {
    this.mdFile = mdFile;
    this.model = model;
    this.ollama = new Ollama();
  }

  async initialize() {
    await this.loadLogs();
  }

  async paraphrase(text: string): Promise<string> {
    try {
      const response = await this.ollama.generate({
        model: this.model,
        prompt: `Please fix the grammar and make this text more readable and descriptive. Keep it concise but clear. Only return the improved text, nothing else:\n\n${text}`,
        stream: false
      });

      return response.response.trim();
    } catch (error) {
      console.error('Ollama error:', error);
      return text; // Return original text if paraphrasing fails
    }
  }

  async loadLogs() {
    try {
      const content = await fs.readFile(this.mdFile, 'utf-8');

      // Parse logs from markdown
      const logPattern = /## Log (\d+)\n\n\*\*Date:\*\* (.+?)\n\n(.+?)(?=\n## Log \d+|\n*$)/gs;
      let match;

      while ((match = logPattern.exec(content)) !== null) {
        const logId = parseInt(match[1]);
        const date = match[2];
        const text = match[3].trim();

        this.logs.set(logId, { id: logId, date, text });
        this.nextId = Math.max(this.nextId, logId + 1);
      }
    } catch (error) {
      // File doesn't exist yet, that's okay
      console.log('No existing logs file found, starting fresh');
    }
  }

  async saveLogs() {
    let content = '# Logbook\n\n';

    const sortedLogs = Array.from(this.logs.entries()).sort((a, b) => a[0] - b[0]);

    for (const [logId, log] of sortedLogs) {
      content += `## Log ${logId}\n\n`;
      content += `**Date:** ${log.date}\n\n`;
      content += `${log.text}\n\n`;
    }

    await fs.writeFile(this.mdFile, content, 'utf-8');
  }

  async entry(text: string) {
    const paraphrased = await this.paraphrase(text);
    const logId = this.nextId;
    const timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(',', '');

    const log: Log = {
      id: logId,
      date: timestamp,
      text: paraphrased
    };

    this.logs.set(logId, log);
    this.nextId++;
    await this.saveLogs();

    return {
      id: logId,
      date: timestamp,
      text: paraphrased,
      original: text
    };
  }

  async edit(logId: number, text: string) {
    const log = this.logs.get(logId);
    if (!log) {
      return null;
    }

    const paraphrased = await this.paraphrase(text);
    const oldText = log.text;

    log.text = paraphrased;
    await this.saveLogs();

    return {
      id: logId,
      date: log.date,
      text: paraphrased,
      old_text: oldText
    };
  }

  getAllLogs(): Log[] {
    return Array.from(this.logs.values()).sort((a, b) => a.id - b.id);
  }

  async delete(logId: number): Promise<boolean> {
    if (this.logs.has(logId)) {
      this.logs.delete(logId);
      await this.saveLogs();
      return true;
    }
    return false;
  }
}

// Initialize logbook
const logbook = new Logbook();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve HTML
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../templates/index.html'));
});

// API Routes
app.get('/api/logs', (req: Request, res: Response) => {
  const logs = logbook.getAllLogs();
  res.json(logs);
});

app.post('/api/logs', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const result = await logbook.entry(text);
    res.json(result);
  } catch (error) {
    console.error('Error creating log:', error);
    res.status(500).json({ error: 'Failed to create log' });
  }
});

app.put('/api/logs/:id', async (req: Request, res: Response) => {
  try {
    const logId = parseInt(req.params.id);
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const result = await logbook.edit(logId, text);
    if (result === null) {
      return res.status(404).json({ error: 'Log not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error updating log:', error);
    res.status(500).json({ error: 'Failed to update log' });
  }
});

app.delete('/api/logs/:id', async (req: Request, res: Response) => {
  try {
    const logId = parseInt(req.params.id);
    const success = await logbook.delete(logId);

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Log not found' });
    }
  } catch (error) {
    console.error('Error deleting log:', error);
    res.status(500).json({ error: 'Failed to delete log' });
  }
});

// Start server
async function startServer() {
  await logbook.initialize();
  app.listen(PORT, () => {
    console.log(`\n🚀 Logbook server running at http://localhost:${PORT}`);
    console.log(`📝 Open your browser to start logging!\n`);
  });
}

startServer().catch(console.error);
