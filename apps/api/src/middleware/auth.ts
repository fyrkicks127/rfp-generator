import { FastifyRequest, FastifyReply } from 'fastify';
import { clerkClient } from '@clerk/clerk-sdk-node';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    };
  }
}

/**
 * Verify Clerk JWT token and attach user to request
 */
export async function authenticateUser(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      request.log.warn('❌ No authorization header');
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'No token provided',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer '

    if (!token || token.length < 10) {
      request.log.warn('❌ Invalid token format');
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid token format',
      });
    }

    request.log.info(`🔐 Verifying token (length: ${token.length})...`);

    // Verify token with Clerk
    let sessionToken;
    try {
      sessionToken = await clerkClient.verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      request.log.info(`✅ Token verified successfully`);
    } catch (verifyError: any) {
      request.log.error(`❌ Token verification failed:`, {
        error: verifyError.message,
        name: verifyError.name,
        code: verifyError.code,
      });
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        details: verifyError.message, // ← Add this for debugging
      });
    }

    request.log.info(`✅ Token verified for Clerk user: ${sessionToken.sub}`);

    // Get user details
    const user = await clerkClient.users.getUser(sessionToken.sub);

    // Attach user to request
    request.user = {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress || '',
      firstName: user.firstName,
      lastName: user.lastName,
    };

    request.log.info(`✅ User authenticated: ${request.user.email} (Clerk ID: ${user.id})`);

  } catch (error: any) {
    request.log.error('❌ Auth error:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication failed',
      details: error.message, // ← Add for debugging
    });
  }
}

/**
 * Ensure user exists in database, create if not
 */
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
    // Find or create user in our database
    let dbUser = await prisma.user.findUnique({
      where: { email: request.user.email },
    });

    if (!dbUser) {
      // Create user in our database
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

    // Attach database user ID (IMPORTANT!)
    request.user.id = dbUser.id;

    request.log.info(`✅ User ready: DB ID = ${dbUser.id}, Email = ${dbUser.email}`);

  } catch (error) {
    request.log.error('❌ Database error in ensureUser:', error);
    return reply.code(500).send({
      error: 'Internal server error',
      message: 'Failed to verify user',
    });
  }
}