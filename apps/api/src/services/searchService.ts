import { embeddingService } from './embeddingService.js';
import { qdrantService } from './qdrantService.js';
import { prisma } from '../lib/db.js';

export interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  metadata: {
    filename: string;
    type: string;
    position: number;
  };
}

export class SearchService {
  /**
   * Search for similar documents
   */
  async search(
    query: string,
    limit: number = 5,
    documentType?: string
  ): Promise<SearchResult[]> {
    try {
      // Step 1: Convert query to embedding
      console.log(`🔍 Searching for: "${query}"`);
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // Step 2: Search Qdrant for similar vectors
      let filter = undefined;
      if (documentType) {
        filter = {
          must: [
            {
              key: 'metadata.type',
              match: { value: documentType }
            }
          ]
        };
      }

      const qdrantResults = await qdrantService.search(
        queryEmbedding,
        limit,
        filter
      );

      console.log(`📊 Found ${qdrantResults.length} results from Qdrant`);

      // Step 3: Get document metadata from PostgreSQL
      const results: SearchResult[] = [];
      
      for (const result of qdrantResults) {
        const chunk = await prisma.chunk.findUnique({
          where: { id: result.payload.chunkId },
          include: {
            document: {
              select: {
                id: true,
                filename: true,
                type: true,
              }
            }
          }
        });

        if (chunk) {
          results.push({
            chunkId: chunk.id,
            documentId: chunk.documentId,
            content: chunk.content,
            score: result.score,
            metadata: {
              filename: chunk.document.filename,
              type: chunk.document.type,
              position: chunk.position,
            },
          });
        }
      }

      console.log(`✅ Returning ${results.length} results`);
      return results;

    } catch (error) {
      console.error('Search error:', error);
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search within a specific document
   */
  async searchInDocument(
    query: string,
    documentId: string,
    limit: number = 5
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      const filter = {
        must: [
          {
            key: 'documentId',
            match: { value: documentId }
          }
        ]
      };

      const qdrantResults = await qdrantService.search(
        queryEmbedding,
        limit,
        filter
      );

      // Get full chunk data
      const results: SearchResult[] = [];
      
      for (const result of qdrantResults) {
        const chunk = await prisma.chunk.findUnique({
          where: { id: result.payload.chunkId },
          include: {
            document: {
              select: {
                id: true,
                filename: true,
                type: true,
              }
            }
          }
        });

        if (chunk) {
          results.push({
            chunkId: chunk.id,
            documentId: chunk.documentId,
            content: chunk.content,
            score: result.score,
            metadata: {
              filename: chunk.document.filename,
              type: chunk.document.type,
              position: chunk.position,
            },
          });
        }
      }

      return results;

    } catch (error) {
      console.error('Document search error:', error);
      throw new Error(`Document search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton
export const searchService = new SearchService();