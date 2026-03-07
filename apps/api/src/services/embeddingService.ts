import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class EmbeddingService {
  /**
   * Generate embeddings for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small', // Cheapest & fast
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Embedding generation error:', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      // OpenAI allows batch embedding (up to 2048 inputs)
      const batchSize = 2048;
      const embeddings: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: batch,
          encoding_format: 'float',
        });

        embeddings.push(...response.data.map(d => d.embedding));
      }

      return embeddings;
    } catch (error) {
      console.error('Batch embedding error:', error);
      throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get embedding dimensions for the model
   */
  getEmbeddingDimensions(): number {
    return 1536; // text-embedding-3-small outputs 1536 dimensions
  }
}

// Export singleton
export const embeddingService = new EmbeddingService();