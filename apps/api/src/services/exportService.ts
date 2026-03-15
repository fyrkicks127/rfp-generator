import puppeteer from 'puppeteer';
//import pptxgen from 'pptxgenjs';
import fs from 'fs/promises';
import path from 'path';

interface ExportOptions {
  title: string;
  content: string;
  format: 'PDF' | 'PPTX';
}

export class ExportService {
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(process.cwd(), 'exports');
  }

  private async ensureExportsDir(): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  /**
 * Export as PDF
 */
async exportToPDF(options: ExportOptions): Promise<string> {
  try {
    await this.ensureExportsDir();

    const { title, content } = options;
    
    console.log('📄 Starting PDF export...');
    console.log('Title:', title);
    console.log('Content length:', content.length);
    
    const filename = `${Date.now()}-${title.replace(/[^a-z0-9]/gi, '-').substring(0, 50)}.pdf`;
    const filepath = path.join(this.outputDir, filename);
    
    console.log('Output path:', filepath);

    const htmlContent = this.generateHTML(title, content);
    console.log('HTML generated, length:', htmlContent.length);

    console.log('Launching puppeteer...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      console.log('Creating new page...');
      const page = await browser.newPage();
      
      console.log('Setting content...');
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      console.log('Generating PDF...');
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
      console.log('Closing browser...');
      await browser.close();
    }
  } catch (error) {
    console.error('❌ PDF export failed:', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : 'Unknown',
    });
    throw error;
  }
}

 /**
 * Export as PowerPoint
 */
async exportToPPTX(options: ExportOptions): Promise<string> {
  try {
    await this.ensureExportsDir();

    const { title, content } = options;
    
    console.log('📊 Starting PPTX export...');
    console.log('Title:', title);
    console.log('Content length:', content.length);
    
    const filename = `${Date.now()}-${title.replace(/[^a-z0-9]/gi, '-').substring(0, 50)}.pptx`;
    const filepath = path.join(this.outputDir, filename);
    
    console.log('Output path:', filepath);

    // ✅ FIX: Use dynamic import for pptxgenjs
    const pptxgenModule = await import('pptxgenjs');
    const pptxgen = pptxgenModule.default;
    
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_16x9';

    // Title slide
    console.log('Creating title slide...');
    const titleSlide = pptx.addSlide();
    titleSlide.background = { color: 'F8F9FA' };
    titleSlide.addText(title, {
      x: 0.5,
      y: 2.5,
      w: 9,
      h: 1.5,
      fontSize: 44,
      bold: true,
      color: '2C3E50',
      align: 'center',
    });

    titleSlide.addText(new Date().toLocaleDateString(), {
      x: 0.5,
      y: 4.5,
      w: 9,
      h: 0.5,
      fontSize: 18,
      color: '7F8C8D',
      align: 'center',
    });

    // Split content into sections
    console.log('Parsing content into sections...');
    const sections = this.parseContentIntoSections(content);
    console.log(`Created ${sections.length} sections`);

    sections.forEach((section, index) => {
      console.log(`Adding slide ${index + 1}: ${section.title}`);
      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };

      slide.addText(section.title, {
        x: 0.5,
        y: 0.5,
        w: 9,
        h: 0.8,
        fontSize: 28,
        bold: true,
        color: '34495E',
      });

      slide.addText(section.content, {
        x: 0.5,
        y: 1.5,
        w: 9,
        h: 4.5,
        fontSize: 16,
        color: '555555',
        valign: 'top',
      });
    });

    console.log('Writing PPTX file...');
    await pptx.writeFile({ fileName: filepath });

    console.log(`✅ PPTX generated: ${filename}`);
    return filepath;
  } catch (error) {
    console.error('❌ PPTX export failed:', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : 'Unknown',
    });
    throw error;
  }
}

  private generateHTML(title: string, content: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px;
          }
          h1 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
            margin-bottom: 30px;
          }
          h2 {
            color: #34495e;
            margin-top: 30px;
            margin-bottom: 15px;
          }
          p {
            margin-bottom: 15px;
            text-align: justify;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
          }
          .date {
            color: #7f8c8d;
            font-size: 14px;
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
      </body>
      </html>
    `;
  }

  private formatContentAsHTML(content: string): string {
    return content
      .split('\n\n')
      .map((para) => {
        const trimmed = para.trim();
        if (!trimmed) return '';
        
        if (trimmed.match(/^[A-Z][^:]*:$/)) {
          return `<h2>${trimmed.replace(':', '')}</h2>`;
        }
        
        return `<p>${trimmed}</p>`;
      })
      .join('\n');
  }

  private parseContentIntoSections(content: string): Array<{ title: string; content: string }> {
    const sections: Array<{ title: string; content: string }> = [];
    const lines = content.split('\n');
    let currentSection: { title: string; content: string } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.match(/^[A-Z][^:]*:$/) || (trimmed.match(/^[A-Z\s]+$/) && trimmed.length > 3)) {
        if (currentSection) {
          const section = currentSection;
          if (section.content.trim()) {
            sections.push({
              title: section.title,
              content: section.content,
            });
          }
        }

        currentSection = {
          title: trimmed.replace(':', ''),
          content: '',
        };
      } else if (currentSection && trimmed) {
        currentSection.content += line + '\n';
      } else if (!currentSection && trimmed) {
        currentSection = {
          title: 'Overview',
          content: line + '\n',
        };
      }
    }

    if (currentSection) {
      const section = currentSection;
      if (section.content.trim()) {
        sections.push({
          title: section.title,
          content: section.content.substring(0, 800),
        });
      }
    }

    return sections.length > 0 ? sections : [{ title: 'Proposal', content: content.substring(0, 800) }];
  }

  async deleteExport(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
      console.log(`🗑️ Deleted export: ${filepath}`);
    } catch (error) {
      console.error('Failed to delete export:', error);
    }
  }
}

export const exportService = new ExportService();