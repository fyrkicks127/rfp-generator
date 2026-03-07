import { FastifyInstance } from 'fastify';
import { searchService } from '../services/searchService.js';
import { z } from 'zod';
import { authenticateUser, ensureUser } from '../middleware/auth.js';

// Validation schemas
const searchSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  limit: z.number().min(1).max(20).optional(),
  type: z.enum(['RFP', 'PAST_PROPOSAL', 'COMPANY_PROFILE', 'OTHER']).optional(),
});

export default async function searchRoutes(fastify: FastifyInstance) {
  
  // Search endpoint (PROTECTED)
  fastify.post('/query', {
    preHandler: [authenticateUser, ensureUser] // ← ADD AUTH
  }, async (request, reply) => {
    try {
      const user = request.user!; // ← Get authenticated user
      const body = request.body as any;
      
      // Validate input
      const validated = searchSchema.parse({
        query: body.query,
        limit: body.limit || 5,
        type: body.type,
      });

      if (!validated.query || validated.query.trim().length === 0) {
        return reply.code(400).send({
          error: 'Query cannot be empty',
        });
      }

      fastify.log.info(`🔍 Search request from user ${user.id}: "${validated.query}"`);

      // Perform search (with userId)
      const results = await searchService.search(
        validated.query,
        validated.limit,
        user.id, // ← Pass userId
        validated.type
      );

      fastify.log.info(`✅ Returning ${results.length} results to user ${user.id}`);

      return {
        query: validated.query,
        results,
        total: results.length,
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation error',
          details: error.errors,
        });
      }

      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Search failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Search within specific document (PROTECTED)
  fastify.post('/document/:documentId', {
    preHandler: [authenticateUser, ensureUser] // ← ADD AUTH
  }, async (request, reply) => {
    try {
      const user = request.user!; // ← Get authenticated user
      const { documentId } = request.params as { documentId: string };
      const body = request.body as any;

      if (!body.query || body.query.trim().length === 0) {
        return reply.code(400).send({
          error: 'Query is required',
        });
      }

      const limit = body.limit || 5;

      const results = await searchService.searchInDocument(
        body.query,
        documentId,
        user.id, // ← Pass userId
        limit
      );

      return {
        query: body.query,
        documentId,
        results,
        total: results.length,
      };

    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Search failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get search suggestions (similar to a chunk) - PROTECTED
  fastify.get('/similar/:chunkId', {
    preHandler: [authenticateUser, ensureUser] // ← ADD AUTH
  }, async (request, reply) => {
    try {
      const user = request.user!; // ← Get authenticated user
      const { chunkId } = request.params as { chunkId: string };

      // Get the chunk content
      const { prisma } = await import('../lib/db.js');
      const chunk = await prisma.chunk.findUnique({
        where: { id: chunkId },
        include: {
          document: {
            select: { userId: true }
          }
        }
      });

      if (!chunk) {
        return reply.code(404).send({
          error: 'Chunk not found',
        });
      }

      // Security: Verify user owns the document
      if (chunk.document.userId !== user.id) {
        return reply.code(403).send({
          error: 'Access denied',
        });
      }

      // Search for similar chunks (only in user's documents)
      const results = await searchService.search(
        chunk.content, 
        5,
        user.id // ← Pass userId
      );

      // Filter out the original chunk
      const filtered = results.filter(r => r.chunkId !== chunkId);

      return {
        original: {
          chunkId: chunk.id,
          content: chunk.content.slice(0, 200) + '...',
        },
        similar: filtered,
        total: filtered.length,
      };

    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Similar search failed',
      });
    }
  });
}