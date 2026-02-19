import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

interface ParsedDocument {
  text: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
    characterCount: number;
  };
}

export class DocumentService {
  /**
   * Parse document based on MIME type
   */
  async parseDocument(
    buffer: Buffer,
    mimetype: string
  ): Promise<ParsedDocument> {
    switch (mimetype) {
      case 'application/pdf':
        return this.parsePDF(buffer);
      
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        return this.parseDOCX(buffer);
      
      case 'text/plain':
        return this.parsePlainText(buffer);
      
      default:
        throw new Error(`Unsupported file type: ${mimetype}`);
    }
  }

  /**
   * Parse PDF document using pdfjs-dist
   */
  private async parsePDF(buffer: Buffer): Promise<ParsedDocument> {
    try {
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
      });

      const pdf = await loadingTask.promise;
      const pageCount = pdf.numPages;
      
      // Extract text from all pages
      const textPromises = [];
      for (let i = 1; i <= pageCount; i++) {
        textPromises.push(this.extractPageText(pdf, i));
      }
      
      const pageTexts = await Promise.all(textPromises);
      const text = pageTexts.join('\n\n');
      const wordCount = this.countWords(text);
      
      return {
        text: text.trim(),
        metadata: {
          pageCount,
          wordCount,
          characterCount: text.length,
        },
      };
    } catch (error) {
      console.error('PDF parse error:', error);
      throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from a single PDF page
   */
  private async extractPageText(pdf: any, pageNumber: number): Promise<string> {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    
    // Combine all text items
    const text = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    
    return text;
  }

  /**
   * Parse DOCX document
   */
  private async parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      
      const text = result.value;
      const wordCount = this.countWords(text);
      
      return {
        text: text.trim(),
        metadata: {
          wordCount,
          characterCount: text.length,
        },
      };
    } catch (error) {
      throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse plain text file
   */
  private async parsePlainText(buffer: Buffer): Promise<ParsedDocument> {
    const text = buffer.toString('utf-8');
    const wordCount = this.countWords(text);
    
    return {
      text: text.trim(),
      metadata: {
        wordCount,
        characterCount: text.length,
      },
    };
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0)
      .length;
  }

  /**
   * Chunk text into smaller pieces for embedding
   */
  chunkText(
    text: string,
    chunkSize: number = 1000,
    overlap: number = 200
  ): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.slice(start, end);
      
      if (chunk.trim().length > 0) {
        chunks.push(chunk.trim());
      }
      
      // Move forward, accounting for overlap
      start = end - overlap;
      
      // Prevent infinite loop
      if (start >= text.length - overlap) {
        break;
      }
    }

    return chunks;
  }

  /**
   * Extract metadata from text
   */
  extractMetadata(text: string): Record<string, any> {
    // Simple metadata extraction
    const lines = text.split('\n');
    const firstLine = lines[0] || '';
    
    return {
      preview: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
      firstLine: firstLine.slice(0, 100),
      lineCount: lines.length,
      hasNumbers: /\d/.test(text),
      hasUrls: /https?:\/\//.test(text),
    };
  }
}

// Export singleton instance
export const documentService = new DocumentService();