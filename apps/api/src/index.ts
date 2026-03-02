import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from 'dotenv';
import { prisma } from './lib/db.js';  
import documentsRoutes from './routes/documents.js';  
import { qdrantService } from './services/qdrantService.js'; 
import searchRoutes from './routes/search.js';
import generateRoutes from './routes/generate.js';
import agentsRoutes from './routes/agents.js';
import cacheRoutes from './routes/cache.js';

// Load environment variables
config();

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Register plugins
await fastify.register(cors, {
  origin: process.env.NODE_ENV === 'production' ? false : true,
});

await fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
});

await qdrantService.initializeCollection();

// Health check
fastify.get('/health', async () => {
  const qdrantInfo = await qdrantService.getCollectionInfo();
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'connected',
      qdrant: qdrantInfo ? 'connected' : 'disconnected',
    },
  };
});

// Root route
fastify.get('/', async () => {
  return {
    name: 'RFP Generator API',
    version: '1.0.0',
    status: 'running',
  };
});

// ← ADD THIS NEW ROUTE
fastify.get('/db-test', async () => {
  try {
    const userCount = await prisma.user.count();
    const documentCount = await prisma.document.count();
    const proposalCount = await prisma.proposal.count();
    
    return {
      status: 'connected',
      counts: {
        users: userCount,
        documents: documentCount,
        proposals: proposalCount,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

await fastify.register(documentsRoutes, { prefix: '/api/documents' });
await fastify.register(searchRoutes, { prefix: '/api/search' });
await fastify.register(generateRoutes, { prefix: '/api/generate' });
await fastify.register(agentsRoutes, { prefix: '/api/agents' });
await fastify.register(cacheRoutes, { prefix: '/api/cache' });
// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001');
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    console.log(`🚀 Server running on http://localhost:${port}`);
    console.log(`📊 Health check: http://localhost:${port}/health`);
    console.log(`📁 Documents API: http://localhost:${port}/api/documents`);
    console.log(`🔍 Search API: http://localhost:${port}/api/search`);
    console.log(`🤖 Generate API: http://localhost:${port}/api/generate`); 
    console.log(`🤖 Agents API: http://localhost:${port}/api/agents`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
