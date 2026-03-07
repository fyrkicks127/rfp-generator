import { embeddingService } from './embeddingService.js';
import { qdrantService } from './qdrantService.js';
import { prisma } from '../lib/db.js';
import { cacheService } from '../lib/redis.js';
import crypto from 'crypto';

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
   * Generate cache key for search (include userId for isolation)
   */
  private getCacheKey(
    query: string, 
    limit: number, 
    userId: string,  // ← ADD userId
    documentType?: string
  ): string {
    const hash = crypto
      .createHash('md5')
      .update(`${userId}:${query}:${limit}:${documentType || 'all'}`) // ← Include userId
      .digest('hex');
    
    return `search:${userId}:${hash}`; // ← User-specific cache key
  }

  /**
   * Search for similar documents (user-scoped)
   */
  async search(
    query: string,
    limit: number = 5,
    userId: string, // ← ADD userId parameter
    documentType?: string
  ): Promise<SearchResult[]> {
    try {
      console.log(`documentType - ${documentType}`)
      // Step 1: Check cache (user-specific)
      const cacheKey = this.getCacheKey(query, limit, userId, documentType);
      const cached = await cacheService.get<SearchResult[]>(cacheKey);
      
      if (cached) {
        console.log(`🎯 Cache HIT for user ${userId}: "${query}"`);
        return cached;
      }
      
      console.log(`❌ Cache MISS for user ${userId}: "${query}"`);

      // Step 2: Generate embedding
      console.log(`🔍 Searching for: "${query}"`);
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // Step 3: Build filter (userId + optional type)
      let filter: any = {
        must: [
          {
            key: 'userId', // ← Filter by userId in Qdrant
            match: { value: userId }
          }
        ]
      };

      if (documentType) {
        filter.must.push({
          key: 'metadata.type',
          match: { value: documentType }
        });
      }

      // Step 4: Search Qdrant with user filter
      const qdrantResults = await qdrantService.search(
        queryEmbedding,
        limit,
        filter
      );

      console.log(`📊 Found ${qdrantResults.length} results from Qdrant for user ${userId}`);

      // Step 5: Get document metadata from PostgreSQL
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
                userId: true, // ← Get userId to verify
              }
            }
          }
        });

        // Double-check ownership (security)
        if (chunk && chunk.document.userId === userId) {
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

      console.log(`✅ Returning ${results.length} results for user ${userId}`);

      // Step 6: Cache the results (5 minutes TTL)
      await cacheService.set(cacheKey, results, 300);

      return results;

    } catch (error) {
      console.error('Search error:', error);
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search within a specific document (user-scoped)
   */
  async searchInDocument(
    query: string,
    documentId: string,
    userId: string, // ← ADD userId
    limit: number = 5
  ): Promise<SearchResult[]> {
    try {
      // Verify user owns the document first
      const document = await prisma.document.findFirst({
        where: {
          id: documentId,
          userId: userId, // ← Security check
        }
      });

      if (!document) {
        throw new Error('Document not found or access denied');
      }

      // Cache key includes userId and documentId
      const cacheKey = `search:doc:${userId}:${documentId}:${crypto.createHash('md5').update(query).digest('hex')}`;
      const cached = await cacheService.get<SearchResult[]>(cacheKey);
      
      if (cached) {
        console.log(`🎯 Cache HIT for document search`);
        return cached;
      }

      const queryEmbedding = await embeddingService.generateEmbedding(query);

      const filter = {
        must: [
          {
            key: 'documentId',
            match: { value: documentId }
          },
          {
            key: 'userId', // ← Also filter by userId
            match: { value: userId }
          }
        ]
      };

      const qdrantResults = await qdrantService.search(
        queryEmbedding,
        limit,
        filter
      );

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
                userId: true,
              }
            }
          }
        });

        if (chunk && chunk.document.userId === userId) {
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

      // Cache for 10 minutes
      await cacheService.set(cacheKey, results, 600);

      return results;

    } catch (error) {
      console.error('Document search error:', error);
      throw new Error(`Document search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton
export const searchService = new SearchService();