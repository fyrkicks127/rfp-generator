import { QdrantClient } from '@qdrant/js-client-rest';
import { randomUUID } from 'crypto';

const client = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

export interface VectorPoint {
  id: string; // This will be the chunkId from Prisma
  vector: number[];
  payload: {
    documentId: string;
    chunkId: string;
    content: string;
    position: number;
    metadata?: any;
  };
}

export interface SearchResult {
  id: string;
  score: number;
  payload: {
    documentId: string;
    chunkId: string;
    content: string;
    position: number;
    metadata?: any;
  };
}

export class QdrantService {
  private collectionName = 'rfp_documents';

  /**
   * Initialize Qdrant collection
   */
  async initializeCollection(): Promise<void> {
    try {
      // Check if collection exists
      const collections = await client.getCollections();
      const exists = collections.collections.some(
        c => c.name === this.collectionName
      );

      if (exists) {
        console.log(`✅ Collection '${this.collectionName}' already exists`);
        return;
      }

      // Create collection
      await client.createCollection(this.collectionName, {
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
        optimizers_config: {
          indexing_threshold: 10000,
        },
      });

      console.log(`✅ Created collection '${this.collectionName}'`);
    } catch (error) {
      console.error('Qdrant initialization error:', error);
      throw new Error(`Failed to initialize Qdrant: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert CUID to UUID-compatible format
   * Qdrant requires valid UUID, so we generate one and store original in payload
   */
  private generateUUID(): string {
    return randomUUID();
  }

  /**
   * Store vectors in Qdrant
   */
  async upsertVectors(points: VectorPoint[]): Promise<void> {
    try {
      await client.upsert(this.collectionName, {
        wait: true,
        points: points.map(p => ({
          id: this.generateUUID(), // Generate valid UUID for Qdrant
          vector: p.vector,
          payload: {
            ...p.payload,
            originalId: p.id, // Store original CUID in payload
          },
        })),
      });

      console.log(`✅ Upserted ${points.length} vectors to Qdrant`);
    } catch (error) {
      console.error('Qdrant upsert error:', error);
      throw new Error(`Failed to store vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search for similar vectors
   */
  async search(
    queryVector: number[],
    limit: number = 5,
    filter?: any
  ): Promise<SearchResult[]> {
    try {
      const results = await client.search(this.collectionName, {
        vector: queryVector,
        limit,
        filter,
        with_payload: true,
      });

      return results.map(r => ({
        id: (r.payload as any)?.originalId || (r.id as string),
        score: r.score,
        payload: r.payload as any,
      }));
    } catch (error) {
      console.error('Qdrant search error:', error);
      throw new Error(`Failed to search vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete vectors by document ID
   */
  async deleteByDocumentId(documentId: string): Promise<void> {
    try {
      await client.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: 'documentId',
              match: { value: documentId },
            },
          ],
        },
      });

      console.log(`✅ Deleted vectors for document ${documentId}`);
    } catch (error) {
      console.error('Qdrant delete error:', error);
      throw new Error(`Failed to delete vectors: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(): Promise<any> {
    try {
      return await client.getCollection(this.collectionName);
    } catch (error) {
      console.error('Qdrant collection info error:', error);
      return null;
    }
  }
}

// Export singleton
export const qdrantService = new QdrantService();