import { createWriteStream, promises as fs } from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
type PdfKitDocument = PDFKit.PDFDocument;

interface NotebookLogAttachment {
  type: 'image';
  filename: string;
  mimeType: string;
  name?: string;
}

interface NotebookLog {
  id: number;
  date: string;
  text: string;
  title?: string;
  attachments?: NotebookLogAttachment[];
}

export interface NotebookExportData {
  name: string;
  slug: string;
  logs: NotebookLog[];
}

export interface PDFGenerationOptions {
  notebook: NotebookExportData;
  outputPath: string;
  onProgress?: (progress: number, message: string) => void;
  signal?: AbortSignal;
}

export interface PDFGenerationResult {
  filePath: string;
  pageCount: number;
}

interface PDFGeneratorConfig {
  notebooksRoot?: string;
}

export class PDFGenerator {
  private readonly pageWidth = 612; // Letter width in points
  private readonly pageHeight = 792; // Letter height in points
  private readonly notebooksRoot: string;

  constructor(config: PDFGeneratorConfig = {}) {
    this.notebooksRoot = config.notebooksRoot ?? path.join(__dirname, '../../data/notebooks');
  }

  async generateJournal(options: PDFGenerationOptions): Promise<PDFGenerationResult> {
    const { notebook, outputPath, onProgress, signal } = options;

    if (!notebook || !Array.isArray(notebook.logs)) {
      throw new Error('Notebook data is required for PDF export');
    }

    this.throwIfAborted(signal);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, bottom: 54, left: 72, right: 72 }
    });

    const tempPath = `${outputPath}.tmp`;
    const writeStream = createWriteStream(tempPath);

    const cleanup = async () => {
      writeStream.destroy();
      await fs.rm(tempPath, { force: true });
    };

    if (signal) {
      const abortHandler = () => {
        const abortError = new Error('Export cancelled');
        abortError.name = 'AbortError';
        doc.emit('error', abortError);
      };
      if (signal.aborted) {
        abortHandler();
      } else {
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    }

    const progress = (value: number, message: string) => {
      if (typeof onProgress === 'function') {
        onProgress(value, message);
      }
    };

    const renderHeader = () => {
      doc.moveTo(doc.page.margins.left, doc.page.margins.top - 12);
      doc.font('Helvetica-Bold');
      doc.fontSize(18);
      doc.fillColor('#1f1b15');
      doc.text(notebook.name, {
        align: 'left',
        width: this.getContentWidth(),
        lineGap: 4
      });
      doc.moveDown(0.5);
    };

    let currentPageNumber = 0;
    const renderFooter = () => {
      const footerY = doc.page.height - doc.page.margins.bottom - 24;
      const previousX = doc.x;
      const previousY = doc.y;

      doc.save();
      doc.font('Helvetica');
      doc.fontSize(8);
      doc.fillColor('#6f6658');
      doc.text(`${currentPageNumber}`, doc.page.margins.left, footerY, {
        width: this.getContentWidth(),
        align: 'center'
      });
      doc.restore();
      doc.x = previousX;
      doc.y = previousY;
    };

    const handlePage = () => {
      currentPageNumber += 1;
      renderFooter();
    };

    doc.on('pageAdded', () => {
      handlePage();
      renderHeader();
    });

    progress(0, 'Preparing export');
    doc.pipe(writeStream);

    handlePage();
    renderHeader();

    const totalLogs = notebook.logs.length || 1;

    for (let index = 0; index < notebook.logs.length; index += 1) {
      this.throwIfAborted(signal);
      const log = notebook.logs[index];
      this.renderLogEntry(doc, notebook.slug, log);

      if (index < notebook.logs.length - 1) {
        doc.moveDown(0.75);
        doc.strokeColor('#d9cdb8');
        doc.lineWidth(0.5);
        doc.moveTo(doc.page.margins.left, doc.y).lineTo(this.pageWidth - doc.page.margins.right, doc.y).stroke();
        doc.moveDown(0.75);
      }

      progress((index + 1) / totalLogs, `Exported entry ${index + 1} of ${notebook.logs.length}`);
    }

    doc.end();

    try {
      await new Promise<void>((resolve, reject) => {
        const handleError = (error: unknown) => {
          reject(error instanceof Error ? error : new Error('Failed to generate PDF'));
        };

        writeStream.on('finish', resolve);
        writeStream.on('error', handleError);
        doc.on('error', handleError);
      });

      await fs.rename(tempPath, outputPath);
      progress(1, 'Export complete');
      return { filePath: outputPath, pageCount: currentPageNumber };
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  private getContentWidth() {
    return this.pageWidth - 144; // margins left/right 72 each
  }

  private throwIfAborted(signal?: AbortSignal | null) {
    if (signal?.aborted) {
      const abortError = new Error('Export cancelled');
      abortError.name = 'AbortError';
      throw abortError;
    }
  }

  private renderLogEntry(doc: PdfKitDocument, slug: string, log: NotebookLog) {
    const title = log.title || `Entry ${log.id}`;
    doc.font('Helvetica-Bold');
    doc.fontSize(14);
    doc.fillColor('#1f1b15');
    doc.text(title, {
      width: this.getContentWidth(),
      lineGap: 6
    });

    doc.moveDown(0.2);
    this.renderDateBox(doc, log.date);
    doc.moveDown(0.6);

    doc.font('Helvetica');
    doc.fontSize(10);
    doc.fillColor('#1f1b15');

    const paragraphs = log.text.split(/\n{2,}/).map((para) => para.trim());
    const hasAttachments = Array.isArray(log.attachments) && log.attachments.length > 0;
    const startX = doc.page.margins.left;
    const contentWidth = this.getContentWidth();

    for (let i = 0; i < paragraphs.length; i += 1) {
      const paragraph = paragraphs[i];
      if (!paragraph) continue;

      doc.text(paragraph, startX, doc.y, {
        width: contentWidth,
        align: 'left',
        lineGap: 4
      });

      if (i < paragraphs.length - 1) {
        doc.moveDown(0.6);
      }
    }

    if (hasAttachments && log.attachments) {
      doc.moveDown(0.6);
      this.renderAttachmentsStack(doc, slug, log.attachments, startX, contentWidth);
    }

    doc.moveDown(0.2);
  }

  private renderDateBox(doc: PdfKitDocument, dateText: string) {
    const boxWidth = 140;
    const boxHeight = 24;
    const startX = doc.page.margins.left;
    const startY = doc.y;

    doc.save();
    doc
      .roundedRect(startX, startY, boxWidth, boxHeight, 6)
      .fillAndStroke('#f5f5f5', '#d9cdb8');

    doc.fillColor('#1f1b15');
    doc.font('Helvetica');
    doc.fontSize(9);
    doc.text(dateText, startX + 10, startY + 7, {
      width: boxWidth - 20,
      height: boxHeight - 14
    });
    doc.restore();
    doc.y = startY + boxHeight;
  }

  private renderAttachmentsStack(
    doc: PdfKitDocument,
    slug: string,
    attachments: NotebookLogAttachment[],
    columnX: number,
    columnWidth: number
  ) {
    const maxHeight = 216; // ~3 inches
    const gap = 18;
    const attachmentsDir = path.join(this.notebooksRoot, slug, 'attachments');
    let currentY = doc.y;

    for (const attachment of attachments) {
      if (attachment.type !== 'image' || !attachment.filename) {
        continue;
      }

      const imagePath = path.join(attachmentsDir, attachment.filename);

      try {
        const imageMeta = this.openImage(doc, imagePath);
        if (!imageMeta) {
          continue;
        }

        const { width: rawWidth, height: rawHeight } = imageMeta;
        const scale = Math.min(columnWidth / rawWidth, maxHeight / rawHeight, 1);
        const displayWidth = rawWidth * scale;
        const displayHeight = rawHeight * scale;

        if (currentY + displayHeight > this.getPageBottom(doc)) {
          doc.addPage();
          currentY = doc.y;
        }

        const previousX = doc.x;
        doc.image(imagePath, columnX, currentY, {
          width: displayWidth,
          height: displayHeight
        });

        doc.x = previousX;
        currentY += displayHeight;

        if (attachment.name) {
          doc.font('Helvetica');
          doc.fontSize(9);
          doc.fillColor('#6f6658');
          doc.text(attachment.name, columnX, currentY + 4, {
            width: columnWidth,
            align: 'left'
          });
          doc.fillColor('#1f1b15');
          doc.x = previousX;
          currentY = doc.y;
        }

        currentY += gap;
      } catch (error) {
        console.warn(`Failed to embed image ${attachment.filename}:`, error);
      }
    }
    doc.y = currentY;
  }

  private getPageBottom(doc: PdfKitDocument) {
    return doc.page.height - doc.page.margins.bottom;
  }

  private openImage(doc: PdfKitDocument, imagePath: string): { width: number; height: number } | null {
    try {
      const image = (doc as unknown as { openImage?(path: string): { width: number; height: number } }).openImage?.(
        imagePath
      );
      if (image && typeof image.width === 'number' && typeof image.height === 'number') {
        return { width: image.width, height: image.height };
      }
    } catch (error) {
      console.warn(`Failed to read image metadata for ${imagePath}:`, error);
    }
    return null;
  }
}
