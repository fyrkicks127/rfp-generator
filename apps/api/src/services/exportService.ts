import puppeteer from 'puppeteer';
import PptxGenJS from 'pptxgenjs';
import fs from 'fs/promises';
import path from 'path';

interface ExportOptions {
  title: string;
  content: string;
  format: 'PDF' | 'PPTX';
  template?: 'default' | 'modern' | 'professional';
}

export class ExportService {
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(process.cwd(), 'apps', 'api', 'exports');
  }

  /**
   * Ensure exports directory exists
   */
  private async ensureExportsDir(): Promise<void> {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create exports directory:', error);
    }
  }

  /**
   * Export as PDF
   */
  async exportToPDF(options: ExportOptions): Promise<string> {
    await this.ensureExportsDir();

    const { title, content } = options;
    const filename = `${Date.now()}-${title.replace(/[^a-z0-9]/gi, '-')}.pdf`;
    const filepath = path.join(this.outputDir, filename);

    // Create HTML content with styling
    const htmlContent = this.generateHTML(title, content);

    // Launch puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Generate PDF
      await page.pdf({
        path: filepath,
        format: 'A4',
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm',
        },
        printBackground: true,
      });

      console.log(`✅ PDF generated: ${filename}`);
      return filepath;
    } finally {
      await browser.close();
    }
  }

  /**
   * Export as PowerPoint
   */
  async exportToPPTX(options: ExportOptions): Promise<string> {
    await this.ensureExportsDir();

    const { title, content, template = 'default' } = options;
    const filename = `${Date.now()}-${title.replace(/[^a-z0-9]/gi, '-')}.pptx`;
    const filepath = path.join(this.outputDir, filename);

    const pptx = new PptxGenJS();

    // Apply template theme
    this.applyTemplate(pptx, template);

    // Title slide
    const titleSlide = pptx.addSlide();
    titleSlide.addText(title, {
      x: 0.5,
      y: 2.0,
      w: 9,
      h: 1.5,
      fontSize: 44,
      bold: true,
      color: '363636',
      align: 'center',
    });

    titleSlide.addText(new Date().toLocaleDateString(), {
      x: 0.5,
      y: 4.5,
      w: 9,
      h: 0.5,
      fontSize: 18,
      color: '666666',
      align: 'center',
    });

    // Split content into sections
    const sections = this.parseContentIntoSections(content);

    // Create slides for each section
    sections.forEach((section) => {
      const slide = pptx.addSlide();

      // Section title
      slide.addText(section.title, {
        x: 0.5,
        y: 0.5,
        w: 9,
        h: 0.8,
        fontSize: 32,
        bold: true,
        color: '363636',
      });

      // Section content
      slide.addText(section.content, {
        x: 0.5,
        y: 1.5,
        w: 9,
        h: 4.5,
        fontSize: 18,
        color: '444444',
        valign: 'top',
      });
    });

    // Thank you slide
    const endSlide = pptx.addSlide();
    endSlide.addText('Thank You', {
      x: 0.5,
      y: 2.5,
      w: 9,
      h: 1,
      fontSize: 44,
      bold: true,
      color: '363636',
      align: 'center',
    });

    // Save file
    await pptx.writeFile({ fileName: filepath });

    console.log(`✅ PPTX generated: ${filename}`);
    return filepath;
  }

  /**
   * Generate HTML for PDF
   */
  private generateHTML(title: string, content: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            color: #333;
            padding: 20mm;
          }
          
          h1 {
            font-size: 32px;
            margin-bottom: 10mm;
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 5mm;
          }
          
          h2 {
            font-size: 24px;
            margin-top: 10mm;
            margin-bottom: 5mm;
            color: #34495e;
          }
          
          h3 {
            font-size: 18px;
            margin-top: 5mm;
            margin-bottom: 3mm;
            color: #555;
          }
          
          p {
            margin-bottom: 5mm;
            text-align: justify;
          }
          
          ul, ol {
            margin-left: 8mm;
            margin-bottom: 5mm;
          }
          
          li {
            margin-bottom: 2mm;
          }
          
          .header {
            text-align: center;
            margin-bottom: 15mm;
          }
          
          .date {
            color: #7f8c8d;
            font-size: 14px;
          }
          
          .footer {
            position: fixed;
            bottom: 10mm;
            left: 20mm;
            right: 20mm;
            text-align: center;
            font-size: 12px;
            color: #95a5a6;
            border-top: 1px solid #ecf0f1;
            padding-top: 3mm;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${title}</h1>
          <p class="date">${new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}</p>
        </div>
        
        ${this.formatContentAsHTML(content)}
        
        <div class="footer">
          Generated by RFP Generator | ${new Date().toLocaleDateString()}
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Format plain text content as HTML
   */
  private formatContentAsHTML(content: string): string {
    // Split by double newlines for paragraphs
    const paragraphs = content.split('\n\n');

    return paragraphs
      .map((para) => {
        const trimmed = para.trim();
        if (!trimmed) return '';

        // Detect headers (lines ending with :)
        if (trimmed.match(/^[A-Z][^:]*:$/)) {
          return `<h2>${trimmed.replace(':', '')}</h2>`;
        }

        // Detect list items
        if (trimmed.match(/^[-•*]\s/)) {
          const items = trimmed.split('\n').map((line) => {
            const cleaned = line.replace(/^[-•*]\s/, '').trim();
            return `<li>${cleaned}</li>`;
          });
          return `<ul>${items.join('')}</ul>`;
        }

        // Regular paragraph
        return `<p>${trimmed}</p>`;
      })
      .join('\n');
  }

  /**
 * Parse content into sections for slides
 */
  /**
 * Parse content into sections for slides
 */
/**
 * Parse content into sections for slides
 */
private parseContentIntoSections(content: string): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  const lines = content.split('\n');

  let currentSection: { title: string; content: string } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if line is a header (ends with : or is all caps)
    if (trimmed.match(/^[A-Z][^:]*:$/) || (trimmed.match(/^[A-Z\s]+$/) && trimmed.length > 3)) {
      // Save previous section
      if (currentSection) {
        const section = currentSection; // ✅ Capture in const for type narrowing
        if (section.content.trim()) {
          sections.push({
            title: section.title,
            content: section.content,
          });
        }
      }

      // Start new section
      currentSection = {
        title: trimmed.replace(':', ''),
        content: '',
      };
    } else if (currentSection && trimmed) {
      currentSection.content += line + '\n';
    } else if (!currentSection && trimmed) {
      // Content before first header
      currentSection = {
        title: 'Overview',
        content: line + '\n',
      };
    }
  }

  // Add last section
  if (currentSection) {
    const section = currentSection; // ✅ Capture in const for type narrowing
    if (section.content.trim()) {
      sections.push({
        title: section.title,
        content: section.content,
      });
    }
  }

  // Limit slide content to avoid overflow
  return sections.map((section) => ({
    title: section.title,
    content: section.content.substring(0, 800), // Limit to ~800 chars per slide
  }));
}

  /**
   * Apply PowerPoint template/theme
   */
  private applyTemplate(pptx: PptxGenJS, template: string): void {
    switch (template) {
      case 'modern':
        pptx.layout = 'LAYOUT_WIDE';
        pptx.defineSlideMaster({
          title: 'MASTER_SLIDE',
          background: { color: 'F8F9FA' },
        });
        break;

      case 'professional':
        pptx.layout = 'LAYOUT_16x9';
        pptx.defineSlideMaster({
          title: 'MASTER_SLIDE',
          background: { color: 'FFFFFF' },
        });
        break;

      default: // 'default'
        pptx.layout = 'LAYOUT_16x9';
        pptx.defineSlideMaster({
          title: 'MASTER_SLIDE',
          background: { color: 'FFFFFF' },
        });
    }
  }

  /**
   * Delete export file
   */
  async deleteExport(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
      console.log(`🗑️ Deleted export: ${filepath}`);
    } catch (error) {
      console.error('Failed to delete export:', error);
    }
  }
}

// Export singleton
export const exportService = new ExportService();