import express, { Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { Ollama } from 'ollama';

const app = express();
const PORT = 3000;

interface LogAttachment {
  type: 'image';
  filename: string;
  mimeType: string;
  name: string;
}

interface LogAttachmentResponse extends LogAttachment {
  url: string;
}

interface NotebookLog {
  id: number;
  date: string;
  text: string;
  attachments?: LogAttachment[];
}

interface NotebookLogResponse extends Omit<NotebookLog, 'attachments'> {
  attachments?: LogAttachmentResponse[];
}

interface AttachmentInput {
  type: 'image';
  dataUrl: string;
  name?: string;
}

interface NotebookData {
  name: string;
  slug: string;
  nextId: number;
  logs: NotebookLog[];
}

interface NotebookSummary {
  name: string;
  slug: string;
  logCount: number;
}

class NotebookManager {
  private notebooks: Map<string, NotebookData> = new Map();
  private dataDir: string;
  private model: string;
  private ollama: Ollama;

  constructor(options: { dataDir?: string; model?: string } = {}) {
    this.dataDir = options.dataDir ?? path.join(__dirname, '../data/notebooks');
    this.model = options.model ?? 'llama3.2:latest';
    this.ollama = new Ollama();
  }

  async initialize() {
    await fs.mkdir(this.dataDir, { recursive: true });
    const files = await fs.readdir(this.dataDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(this.dataDir, file);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const notebook = JSON.parse(content) as Partial<NotebookData>;

        if (notebook?.name && notebook?.slug && Array.isArray(notebook.logs)) {
          const normalizedLogs = notebook.logs.map((log) => ({
            ...log,
            attachments: log.attachments ?? []
          }));

          await this.ensureNotebookDirs(notebook.slug);

          this.notebooks.set(notebook.slug, {
            name: notebook.name,
            slug: notebook.slug,
            nextId: notebook.nextId ?? this.getNextIdFromLogs(normalizedLogs),
            logs: normalizedLogs
          });
        }
      } catch (error) {
        console.error(`Failed to load notebook file ${file}:`, error);
      }
    }

    if (this.notebooks.size === 0) {
      await this.createNotebook('General');
    }
  }

  listNotebooks(): NotebookSummary[] {
    return Array.from(this.notebooks.values())
      .map((notebook) => ({
        name: notebook.name,
        slug: notebook.slug,
        logCount: notebook.logs.length
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createNotebook(rawName: string): Promise<NotebookSummary> {
    const name = rawName.trim();
    if (!name) {
      throw new Error('Notebook name is required');
    }

    const slug = this.slugify(name);
    if (!slug) {
      throw new Error('Notebook name must include letters or numbers');
    }
    if (this.notebooks.has(slug)) {
      throw new Error('A notebook with a similar name already exists');
    }

    await this.ensureNotebookDirs(slug);

    const notebook: NotebookData = {
      name,
      slug,
      nextId: 1,
      logs: []
    };

    this.notebooks.set(slug, notebook);
    await this.saveNotebook(notebook);

    return {
      name: notebook.name,
      slug: notebook.slug,
      logCount: 0
    };
  }

  getLogs(slug: string): NotebookLogResponse[] {
    const notebook = this.requireNotebook(slug);
    return [...notebook.logs]
      .sort((a, b) => a.id - b.id)
      .map((log) => this.formatLogForResponse(notebook.slug, log));
  }

  async addLog(
    slug: string,
    text: string,
    attachmentsInput: AttachmentInput[] = [],
    options: { skipParaphrase?: boolean } = {}
  ) {
    const notebook = this.requireNotebook(slug);
    const shouldSkipParaphrase = options.skipParaphrase === true;
    let paraphrased = text;
    if (!shouldSkipParaphrase) {
      try {
        paraphrased = await this.paraphrase(text);
      } catch (error) {
        // If Ollama fails, return the original text and throw error to be handled by caller
        paraphrased = text;
        throw error;
      }
    }
    const logId = notebook.nextId;
    const attachments = await this.saveAttachments(slug, logId, attachmentsInput);
    const newLog: NotebookLog = {
      id: logId,
      date: this.formatTimestamp(),
      text: paraphrased,
      attachments: attachments.length > 0 ? attachments : undefined
    };

    notebook.logs.push(newLog);
    notebook.nextId = logId + 1;
    await this.saveNotebook(notebook);

    return {
      ...this.formatLogForResponse(slug, newLog),
      original: text
    };
  }

  async editLog(slug: string, logId: number, text: string, options: { skipParaphrase?: boolean } = {}) {
    const notebook = this.requireNotebook(slug);
    const log = notebook.logs.find((entry) => entry.id === logId);

    if (!log) {
      return null;
    }

    const shouldSkipParaphrase = options.skipParaphrase === true;
    let paraphrased = text;
    if (!shouldSkipParaphrase) {
      try {
        paraphrased = await this.paraphrase(text);
      } catch (error) {
        // If Ollama fails, return the original text and throw error to be handled by caller
        paraphrased = text;
        throw error;
      }
    }
    const oldText = log.text;
    log.text = paraphrased;
    await this.saveNotebook(notebook);

    return {
      ...this.formatLogForResponse(slug, log),
      old_text: oldText
    };
  }

  async checkOllamaAvailability(): Promise<boolean> {
    return this.checkOllamaConnection();
  }

  async deleteLog(slug: string, logId: number): Promise<boolean> {
    const notebook = this.requireNotebook(slug);
    const index = notebook.logs.findIndex((log) => log.id === logId);
    if (index === -1) {
      return false;
    }

    const [removed] = notebook.logs.splice(index, 1);
    if (removed.attachments) {
      await Promise.all(
        removed.attachments.map((attachment) => this.deleteAttachmentFile(slug, attachment))
      );
    }

    await this.saveNotebook(notebook);
    return true;
  }

  async exportNotebook(slug: string): Promise<string> {
    const notebook = this.requireNotebook(slug);
    const logs = [...notebook.logs].sort((a, b) => a.id - b.id);

    let content = `# ${notebook.name} Logbook\n\n`;

    for (const log of logs) {
      content += `## Log ${log.id}\n\n`;
      content += `**Date:** ${log.date}\n\n`;
      content += `${log.text}\n\n`;

      if (log.attachments && log.attachments.length > 0) {
        for (const attachment of log.attachments) {
          const dataUri = await this.readAttachmentAsDataUri(notebook.slug, attachment);
          if (dataUri) {
            content += `![${attachment.name}](${dataUri})\n\n`;
          }
        }
      }
    }

    return content;
  }

  async getAttachment(slug: string, filename: string) {
    const notebook = this.requireNotebook(slug);
    for (const log of notebook.logs) {
      const match = log.attachments?.find((attachment) => attachment.filename === filename);
      if (match) {
        return {
          filePath: path.join(this.getNotebookAttachmentDir(slug), match.filename),
          mimeType: match.mimeType
        };
      }
    }
    return null;
  }

  private getFilePath(slug: string) {
    return path.join(this.dataDir, `${slug}.json`);
  }

  private getNotebookDir(slug: string) {
    return path.join(this.dataDir, slug);
  }

  private getNotebookAttachmentDir(slug: string) {
    return path.join(this.getNotebookDir(slug), 'attachments');
  }

  private async ensureNotebookDirs(slug: string) {
    await fs.mkdir(this.getNotebookDir(slug), { recursive: true });
    await fs.mkdir(this.getNotebookAttachmentDir(slug), { recursive: true });
  }

  private formatLogForResponse(slug: string, log: NotebookLog): NotebookLogResponse {
    const base = {
      id: log.id,
      date: log.date,
      text: log.text
    };

    if (!log.attachments || log.attachments.length === 0) {
      return base;
    }

    return {
      ...base,
      attachments: log.attachments.map((attachment) => ({
        ...attachment,
        url: this.buildAttachmentUrl(slug, attachment.filename)
      }))
    };
  }

  private buildAttachmentUrl(slug: string, filename: string) {
    return `/api/notebooks/${encodeURIComponent(slug)}/attachments/${encodeURIComponent(filename)}`;
  }

  private async saveAttachments(
    slug: string,
    logId: number,
    inputs: AttachmentInput[]
  ): Promise<LogAttachment[]> {
    if (!inputs || inputs.length === 0) {
      return [];
    }

    const attachmentsDir = this.getNotebookAttachmentDir(slug);
    await fs.mkdir(attachmentsDir, { recursive: true });

    const attachments: LogAttachment[] = [];

    for (const input of inputs) {
      if (input.type !== 'image' || !input.dataUrl) {
        continue;
      }

      const parsed = this.parseDataUrl(input.dataUrl);
      if (!parsed) {
        continue;
      }

      const extension = this.getExtensionForMime(parsed.mimeType);
      const filename = `log-${logId}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${extension}`;
      const filePath = path.join(attachmentsDir, filename);

      try {
        await fs.writeFile(filePath, parsed.buffer);
        attachments.push({
          type: 'image',
          filename,
          mimeType: parsed.mimeType,
          name: input.name?.trim() || 'Pasted image'
        });
      } catch (error) {
        console.error(`Failed to save attachment ${filename}:`, error);
      }
    }

    return attachments;
  }

  private parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) {
      return null;
    }

    const mimeType = match[1];
    const base64Data = match[2];

    try {
      return {
        buffer: Buffer.from(base64Data, 'base64'),
        mimeType
      };
    } catch (error) {
      console.error('Invalid base64 data for attachment:', error);
      return null;
    }
  }

  private getExtensionForMime(mimeType: string) {
    switch (mimeType) {
      case 'image/png':
        return 'png';
      case 'image/jpeg':
      case 'image/jpg':
        return 'jpg';
      case 'image/gif':
        return 'gif';
      case 'image/webp':
        return 'webp';
      default:
        return 'png';
    }
  }

  private async deleteAttachmentFile(slug: string, attachment: LogAttachment) {
    const filePath = path.join(this.getNotebookAttachmentDir(slug), attachment.filename);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.warn(`Failed to delete attachment ${attachment.filename}:`, error);
    }
  }

  private async readAttachmentAsDataUri(
    slug: string,
    attachment: LogAttachment
  ): Promise<string | null> {
    const filePath = path.join(this.getNotebookAttachmentDir(slug), attachment.filename);
    try {
      const file = await fs.readFile(filePath);
      const base64 = file.toString('base64');
      return `data:${attachment.mimeType};base64,${base64}`;
    } catch (error) {
      console.error(`Failed to read attachment ${attachment.filename}:`, error);
      return null;
    }
  }

  private requireNotebook(slug: string): NotebookData {
    const notebook = this.notebooks.get(slug);
    if (!notebook) {
      throw new Error('Notebook not found');
    }
    return notebook;
  }

  private formatTimestamp(): string {
    return new Date()
      .toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
      .replace(',', '');
  }

  private getNextIdFromLogs(logs: NotebookLog[]): number {
    if (logs.length === 0) {
      return 1;
    }

    return Math.max(...logs.map((log) => log.id)) + 1;
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async checkOllamaConnection(): Promise<boolean> {
    try {
      // Try to ping Ollama by asking for a simple response
      await this.ollama.generate({
        model: this.model,
        prompt: "Say 'hello' and nothing else.",
        stream: false
      });
      return true;
    } catch (error) {
      console.warn('Ollama not available:', error);
      return false;
    }
  }

  private async paraphrase(text: string): Promise<string> {
    try {
      const response = await this.ollama.generate({
        model: this.model,
        prompt: `Please fix the grammar and make this text more readable and descriptive. Keep it concise but clear. Only return the improved text, nothing else:\n\n${text}`,
        stream: false
      });

      return response.response.trim();
    } catch (error) {
      console.error('Ollama error:', error);
      throw error; // Re-throw so the calling function can handle the error
    }
  }

  private async saveNotebook(notebook: NotebookData) {
    const sanitizedLogs = notebook.logs.map((log) => {
      const base = {
        id: log.id,
        date: log.date,
        text: log.text
      };

      if (log.attachments && log.attachments.length > 0) {
        return {
          ...base,
          attachments: log.attachments
        };
      }

      return base;
    });

    const serializable: NotebookData = {
      name: notebook.name,
      slug: notebook.slug,
      nextId: notebook.nextId,
      logs: sanitizedLogs
    };

    await fs.writeFile(this.getFilePath(notebook.slug), JSON.stringify(serializable, null, 2), 'utf-8');
  }

  async deleteNotebook(slug: string): Promise<boolean> {
    const notebook = this.notebooks.get(slug);
    if (!notebook) {
      return false;
    }

    this.notebooks.delete(slug);

    try {
      await fs.unlink(this.getFilePath(slug)).catch(() => {});
      await fs.rm(this.getNotebookDir(slug), { recursive: true, force: true }).catch(() => {});
    } catch (error) {
      console.warn(`Failed to fully remove notebook ${slug}:`, error);
    }

    return true;
  }
}

const notebookManager = new NotebookManager();

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static('public'));

app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../templates/index.html'));
});

app.get('/api/notebooks', (req: Request, res: Response) => {
  const notebooks = notebookManager.listNotebooks();
  res.json(notebooks);
});

app.post('/api/notebooks', async (req: Request, res: Response) => {
  try {
    const { name } = req.body as { name?: string };
    if (!name) {
      return res.status(400).json({ error: 'Notebook name is required' });
    }

    const notebook = await notebookManager.createNotebook(name);
    res.status(201).json(notebook);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create notebook';
    res.status(400).json({ error: message });
  }
});

app.delete('/api/notebooks/:slug', async (req: Request, res: Response) => {
  try {
    const deleted = await notebookManager.deleteNotebook(req.params.slug);
    if (!deleted) {
      return res.status(404).json({ error: 'Notebook not found' });
    }
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete notebook';
    res.status(500).json({ error: message });
  }
});

app.get('/api/notebooks/:slug/logs', (req: Request, res: Response) => {
  try {
    const logs = notebookManager.getLogs(req.params.slug);
    res.json(logs);
  } catch (error) {
    res.status(404).json({ error: 'Notebook not found' });
  }
});

app.post('/api/notebooks/:slug/logs', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { text, attachments, mode } = req.body as {
      text?: string;
      attachments?: Array<{ type?: string; dataUrl?: string; name?: string }>;
      mode?: string;
    };

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const attachmentInputs: AttachmentInput[] = Array.isArray(attachments)
      ? attachments
          .filter(
            (item): item is { type: string; dataUrl: string; name?: string } =>
              typeof item?.type === 'string' && typeof item?.dataUrl === 'string'
          )
          .filter((item) => item.type === 'image')
          .map((item) => ({
            type: 'image',
            dataUrl: item.dataUrl,
            name: typeof item.name === 'string' ? item.name : undefined
          }))
      : [];

    const result = await notebookManager.addLog(slug, text, attachmentInputs, {
      skipParaphrase: typeof mode === 'string' && mode.toLowerCase() === 'save'
    });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create log';
    if (message === 'Notebook not found') {
      res.status(404).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

app.put('/api/notebooks/:slug/logs/:id', async (req: Request, res: Response) => {
  try {
    const { slug, id } = req.params;
    const { text, mode } = req.body as { text?: string; mode?: string };

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const result = await notebookManager.editLog(slug, parseInt(id, 10), text, {
      skipParaphrase: typeof mode === 'string' && mode.toLowerCase() === 'save'
    });
    if (result === null) {
      return res.status(404).json({ error: 'Log not found' });
    }

    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update log';
    if (message === 'Notebook not found') {
      res.status(404).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

app.delete('/api/notebooks/:slug/logs/:id', async (req: Request, res: Response) => {
  try {
    const { slug, id } = req.params;
    const success = await notebookManager.deleteLog(slug, parseInt(id, 10));

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Log not found' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete log';
    if (message === 'Notebook not found') {
      res.status(404).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

app.get('/api/notebooks/:slug/export', async (req: Request, res: Response) => {
  try {
    const markdown = await notebookManager.exportNotebook(req.params.slug);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.slug}.md"`);
    res.send(markdown);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export notebook';
    if (message === 'Notebook not found') {
      res.status(404).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

app.get('/api/ollama/health', async (req: Request, res: Response) => {
  try {
    const isAvailable = await notebookManager.checkOllamaAvailability();
    res.json({ available: isAvailable });
  } catch (error) {
    res.status(500).json({ available: false, error: 'Failed to check Ollama status' });
  }
});

app.get('/api/notebooks/:slug/attachments/:filename', async (req: Request, res: Response) => {
  try {
    const { slug, filename } = req.params;
    const attachment = await notebookManager.getAttachment(slug, filename);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const file = await fs.readFile(attachment.filePath);
    res.setHeader('Content-Type', attachment.mimeType);
    res.send(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load attachment';
    if (message === 'Notebook not found') {
      res.status(404).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

async function startServer() {
  await notebookManager.initialize();
  app.listen(PORT, () => {
    console.log(`\n🚀 Logbook server running at http://localhost:${PORT}`);
    console.log(`📝 Open your browser to start logging!\n`);
  });
}

startServer().catch(console.error);
