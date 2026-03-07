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
    mimetype?: string
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
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    try {
      const pdf = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
      }).promise;

      let text = '';
      const pageCount = pdf.numPages;
      
      // ✅ FIX 1: Add validation for page count
      if (pageCount === 0) {
        throw new Error('PDF has no pages');
      }

      for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => item.str)
          .join(' ');
        text += pageText + '\n';
      }

      // ✅ FIX 2: Validate extracted text
      if (!text || text.trim().length === 0) {
        throw new Error('PDF contains no extractable text (might be scanned/image-based)');
      }

      const wordCount = text.split(/\s+/).filter(Boolean).length;
      
      return {
        text: text.trim(),
        metadata: {
          pageCount,
          wordCount,
          characterCount: text.length,
        },
      };
    } catch (error) {
      console.error('PDF parsing error:', error);
      throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse DOCX document
   */
  private async parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      
      const text = result.value;
      
      // ✅ FIX 3: Validate extracted text from DOCX
      if (!text || text.trim().length === 0) {
        throw new Error('DOCX document is empty or contains no text');
      }
      
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
    
    // ✅ FIX 4: Validate plain text is not empty
    if (!text || text.trim().length === 0) {
      throw new Error('Text file is empty');
    }
    
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
   * Returns array of strings (not ChunkData objects)
   */
  chunkText(
    text: string | undefined,
    chunkSize: number = 1000,
    overlap: number = 200
  ): string[] {
    // ✅ FIX 5: Add comprehensive validation with detailed logging
    if (!text) {
      console.warn('⚠️ chunkText received undefined/null text');
      return [];
    }

    if (typeof text !== 'string') {
      console.warn('⚠️ chunkText received non-string value:', typeof text);
      return [];
    }

    if (text.trim().length === 0) {
      console.warn('⚠️ chunkText received empty string');
      return [];
    }

    // ✅ FIX 6: Now safe to use text.length
    console.log(`📏 Chunking text: ${text.length} characters into ~${chunkSize} char chunks`);

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

    console.log(`✅ Created ${chunks.length} chunks from text`);
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