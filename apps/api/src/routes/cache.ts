import { FastifyInstance } from 'fastify';
import { cacheService } from '../lib/redis.js';

export default async function cacheRoutes(fastify: FastifyInstance) {
  
  // Get cache stats
  fastify.get('/stats', async (request, reply) => {
    try {
      const stats = await cacheService.getStats();
      
      return {
        status: 'ok',
        stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to get cache stats',
      });
    }
  });

  // Clear all cache
  fastify.get('/clear', async (request, reply) => {
    try {
      const deleted = await cacheService.delPattern('*');
      
      return {
        success: true,
        message: `Cleared ${deleted} cache keys`,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to clear cache',
      });
    }
  });

  // Clear search cache only
  fastify.get('/clear/search', async (request, reply) => {
    try {
      const deleted = await cacheService.delPattern('search:*');
      
      return {
        success: true,
        message: `Cleared ${deleted} search cache keys`,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({
        error: 'Failed to clear search cache',
      });
    }
  });
}