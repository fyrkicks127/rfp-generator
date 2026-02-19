import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create test user
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      name: 'Test User',
      plan: 'FREE',
    },
  });

  console.log('✅ Created user:', user.email);

  // Create sample RFP document
  const rfpDoc = await prisma.document.create({
    data: {
      userId: user.id,
      filename: 'sample-rfp.pdf',
      fileUrl: '/uploads/sample-rfp.pdf',
      type: 'RFP',
      content: 'Request for Proposal: We are seeking a vendor to provide cloud migration services for our enterprise applications. Timeline: 6 months. Budget: $500k.',
      metadata: {
        pageCount: 5,
        wordCount: 1200,
      },
    },
  });

  console.log('✅ Created RFP document:', rfpDoc.filename);

  // Create sample past proposal
  const proposalDoc = await prisma.document.create({
    data: {
      userId: user.id,
      filename: 'past-winning-proposal.pdf',
      fileUrl: '/uploads/past-proposal.pdf',
      type: 'PAST_PROPOSAL',
      content: 'Executive Summary: Our team has successfully completed 15+ cloud migration projects. We propose a phased approach with AWS as the primary platform.',
      metadata: {
        pageCount: 20,
        wordCount: 5000,
        won: true,
      },
    },
  });

  console.log('✅ Created past proposal:', proposalDoc.filename);

  // Create a sample generated proposal
  const proposal = await prisma.proposal.create({
    data: {
      userId: user.id,
      title: 'Cloud Migration Proposal for Acme Corp',
      content: '# Executive Summary\n\nWe are pleased to submit our proposal...',
      status: 'DRAFT',
      rfpId: rfpDoc.id,
      metadata: {
        tokensUsed: 3500,
        cost: 0.15,
        durationMs: 8500,
      },
    },
  });

  console.log('✅ Created proposal:', proposal.title);

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });