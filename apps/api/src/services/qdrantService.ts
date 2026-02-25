import { QdrantClient } from '@qdrant/js-client-rest';
import { randomUUID } from 'crypto';

const client = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

export interface VectorPoint {
  id: string;
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
   * Initialize Qdrant collection with indexes
   */
  async initializeCollection(): Promise<void> {
    try {
      // Check if collection exists
      const collections = await client.getCollections();
      const exists = collections.collections.some(
        c => c.name === this.collectionName
      );

      if (!exists) {
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
      } else {
        console.log(`✅ Collection '${this.collectionName}' already exists`);
      }

      // Create payload indexes for filtering
      await this.createPayloadIndexes();

    } catch (error) {
      console.error('Qdrant initialization error:', error);
      throw new Error(`Failed to initialize Qdrant: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create payload indexes for filtering
   */
  private async createPayloadIndexes(): Promise<void> {
    try {
      // Create index for metadata.type (for filtering by document type)
      try {
        await client.createPayloadIndex(this.collectionName, {
          field_name: 'metadata.type',
          field_schema: 'keyword',
        });
        console.log(`✅ Created index for metadata.type`);
      } catch (error: any) {
        // Index might already exist, ignore error
        if (!error.message?.includes('already exists')) {
          console.log(`ℹ️  Index for metadata.type: ${error.message}`);
        }
      }

      // Create index for documentId (for filtering by document)
      try {
        await client.createPayloadIndex(this.collectionName, {
          field_name: 'documentId',
          field_schema: 'keyword',
        });
        console.log(`✅ Created index for documentId`);
      } catch (error: any) {
        if (!error.message?.includes('already exists')) {
          console.log(`ℹ️  Index for documentId: ${error.message}`);
        }
      }

    } catch (error) {
      console.error('Payload index creation error:', error);
      // Don't throw - indexes are optional for basic functionality
    }
  }

  /**
   * Convert CUID to UUID-compatible format
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
          id: this.generateUUID(),
          vector: p.vector,
          payload: {
            ...p.payload,
            originalId: p.id,
            // Add metadata with type for filtering
            metadata: {
              type: p.payload.metadata?.type || 'OTHER',
              ...p.payload.metadata,
            },
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