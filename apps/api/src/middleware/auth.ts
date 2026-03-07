import { FastifyRequest, FastifyReply } from 'fastify';
import { createClerkClient } from '@clerk/backend';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      plan?: 'FREE' | 'PRO' | 'TEAM'| 'ENTERPRISE';
    };
  }
}

export async function authenticateUser(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      request.log.warn('❌ No authorization header');
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'No token provided',
      });
    }

    const token = authHeader.substring(7);

    if (!token || token.length < 10) {
      request.log.warn('❌ Invalid token format');
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid token format',
      });
    }

    request.log.info('🔐 Verifying token...');

    const parts = token.split('.');
    if (parts.length !== 3) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid token structure',
      });
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const userId = payload.sub;

    if (!userId) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'No user ID in token',
      });
    }

    request.log.info(`✅ Token decoded for user: ${userId}`);

    let user;
    try {
      user = await clerkClient.users.getUser(userId);
    } catch (err: any) {
      request.log.error('❌ Failed to get user from Clerk:', err.message);
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'User not found',
      });
    }

    request.user = {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress || '',
      firstName: user.firstName,
      lastName: user.lastName,
    };

    request.log.info(`✅ User authenticated: ${request.user.email}`);

  } catch (error: any) {
    request.log.error('❌ Auth error:', error.message);
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication failed',
      details: error.message,
    });
  }
}

export async function ensureUser(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (!request.user) {
    request.log.warn('❌ No user in request');
    return reply.code(401).send({ error: 'Not authenticated' });
  }

  const { prisma } = await import('../lib/db.js');

  try {
    let dbUser = await prisma.user.findUnique({
      where: { email: request.user.email },
    });

    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: {
          email: request.user.email,
          name: `${request.user.firstName || ''} ${request.user.lastName || ''}`.trim() || 'User',
          plan: 'FREE',
        },
      });
      request.log.info(`✅ Created new user: ${dbUser.email} (DB ID: ${dbUser.id})`);
    } else {
      request.log.info(`✅ Found existing user: ${dbUser.email} (DB ID: ${dbUser.id})`);
    }

    // Attach database user ID and plan
    request.user.id = dbUser.id;
    request.user.plan = dbUser.plan;

    request.log.info(`✅ User ready: DB ID = ${dbUser.id}, Plan = ${dbUser.plan}`);

  } catch (error: any) {
    request.log.error('❌ Database error:', error.message);
    return reply.code(500).send({
      error: 'Internal server error',
      message: 'Failed to verify user',
    });
  }
}