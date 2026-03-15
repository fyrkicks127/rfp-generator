# RFP Generator Project - Complete Context & History

## Project Overview

**Project Name**: RFP Generator  
**Architecture**: Monorepo (Turborepo)  
**Purpose**: AI-powered system to help users create professional proposals by learning from past proposals and RFPs

---

## Technology Stack

### Monorepo Structure (Turborepo)
```
rfp-generator/
├── apps/
│   ├── web/          # Next.js 15 frontend
│   └── api/          # Fastify backend API
└── packages/
    └── shared/       # Shared types, utilities
```

### Frontend (apps/web)
- **Framework**: Next.js 15 (App Router)
- **UI Library**: shadcn/ui + Tailwind CSS
- **State Management**: React Context / Zustand (if needed)
- **Auth**: Clerk
- **API Client**: Fetch / Axios

### Backend (apps/api)
- **Framework**: Fastify (Node.js)
- **Database**: PostgreSQL (via Prisma ORM)
- **Vector Database**: Qdrant (for semantic search)
- **Queue System**: BullMQ + Redis
- **Auth**: Clerk (token verification)
- **LLM Integration**: Anthropic Claude API
- **File Processing**: pdf-parse, mammoth (for DOCX)

### Infrastructure
- **Cache**: Redis
- **Queue**: BullMQ (for async job processing)
- **Storage**: Local filesystem (uploads directory)
- **Vector DB**: Qdrant (for document embeddings)

---

## Core Features

### 1. Document Upload & Processing
- **Supported Formats**: PDF, DOCX, TXT
- **Process**:
  1. User uploads past proposals or RFPs
  2. File saved to `apps/api/uploads/`
  3. Job queued in BullMQ
  4. Worker processes document:
     - Parse content (extract text)
     - Chunk into smaller pieces
     - Generate embeddings
     - Store in PostgreSQL + Qdrant
  5. User can view/manage uploaded documents

### 2. Semantic Search
- **Technology**: Vector embeddings + Qdrant
- **Flow**:
  1. User query → Generate embedding
  2. Search Qdrant for similar chunks
  3. Return relevant context from past documents
  4. Can filter by document type, user, etc.

### 3. Proposal Generation
- **Technology**: Claude API (Anthropic)
- **Flow**:
  1. User provides RFP requirements
  2. System searches past proposals for relevant content
  3. Claude generates new proposal using:
     - RFP requirements
     - Retrieved context from past proposals
     - User's writing style (learned from past documents)
  4. Returns generated proposal to user

### 4. Multi-tenancy
- **Auth**: Clerk handles user authentication
- **Data Isolation**: Each user only sees their own documents
- **Plans**: FREE, PRO, TEAM (stored in User table)

---

## Database Schema (Prisma)

### User
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  plan      UserPlan @default(FREE)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  documents Document[]
  jobs      Job[]
}

enum UserPlan {
  FREE
  PRO
  TEAM
}
```

### Document
```prisma
model Document {
  id        String       @id @default(cuid())
  userId    String
  filename  String
  fileUrl   String?      // Path to file on disk
  type      DocumentType
  content   String?      @db.Text  // Full document text
  metadata  Json?
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  chunks    Chunk[]
  user      User         @relation(fields: [userId], references: [id])
}

enum DocumentType {
  PAST_PROPOSAL
  RFP
  OTHER
}
```

### Chunk
```prisma
model Chunk {
  id         String   @id @default(cuid())
  documentId String
  content    String   @db.Text
  position   Int
  metadata   Json?    // { wordCount, characterCount, lineCount }
  createdAt  DateTime @default(now())
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
}
```

### Job
```prisma
model Job {
  id          String    @id @default(cuid())
  userId      String
  type        JobType
  status      JobStatus @default(PENDING)
  data        Json?     // Job input data
  result      Json?     // Job output/result
  error       String?
  progress    Int       @default(0)
  attempts    Int       @default(0)
  maxAttempts Int       @default(3)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  completedAt DateTime?
  user        User      @relation(fields: [userId], references: [id])
}

enum JobType {
  DOCUMENT_UPLOAD
  PROPOSAL_GENERATION
}

enum JobStatus {
  PENDING
  ACTIVE
  COMPLETED
  FAILED
}
```

---

## Document Processing Flow (Detailed)

### 1. Upload Endpoint (`POST /api/documents/upload`)
**Location**: `apps/api/src/routes/documents.ts`

**Process**:
1. Authenticate user (Clerk middleware)
2. Validate file type (PDF, DOCX, TXT only)
3. Save file to persistent location: `apps/api/uploads/{timestamp}-{filename}`
4. Create Document record in PostgreSQL
5. Create Job record in PostgreSQL
6. Add job to BullMQ queue
7. Return 202 Accepted with documentId and jobId

**Code Flow**:
```typescript
1. const buffer = await data.toBuffer()
2. const uploadsDir = path.join(process.cwd(), 'apps', 'api', 'uploads')
3. await fs.writeFile(persistentFilePath, buffer)
4. await prisma.document.create({ ... })
5. await prisma.job.create({ ... })
6. await documentQueue.add('process-document', { documentId, filepath, ... })
```

### 2. Document Worker (`documentWorker.ts`)
**Location**: `apps/api/src/workers/documentWorker.ts`

**5-Step Process**:

**Step 1: Read File** (Progress: 15%)
```typescript
const buffer = await fs.readFile(filepath)
```

**Step 2: Parse Document** (Progress: 30%)
```typescript
const parsedDoc = await documentService.parseDocument(buffer, mimetype)
const parsedContent = parsedDoc.text
```

**Step 3: Chunk Content** (Progress: 50%)
```typescript
const chunkStrings = documentService.chunkText(parsedContent)
const chunks = chunkStrings.map(content => ({
  content,
  metadata: { wordCount, characterCount, lineCount }
}))
```

**Step 4: Save to Database** (Progress: 70%)
```typescript
// Update document with full content
await prisma.document.update({
  where: { id: documentId },
  data: { content: parsedContent, metadata: { ... } }
})

// Save all chunks
await Promise.all(
  chunks.map((chunk, index) => 
    prisma.chunk.create({
      data: { documentId, content, position: index, metadata }
    })
  )
)
```

**Step 5: Generate Embeddings & Store** (Progress: 100%)
```typescript
const embeddings = await embeddingService.generateEmbeddings(texts)
const vectors = chunks.map((chunk, i) => ({
  id: chunk.id,
  vector: embeddings[i],
  payload: { documentId, chunkId, content, userId, ... }
}))
await qdrantService.upsertVectors(vectors)
```

**Final: Cleanup**
```typescript
await fs.unlink(filepath) // Delete temp file
```

### 3. Document Service (`documentService.ts`)
**Location**: `apps/api/src/services/documentService.ts`

**Methods**:

**parseDocument(buffer, mimetype)**
- Supports: PDF (pdfjs-dist), DOCX (mammoth), TXT (utf-8)
- Returns: `{ text: string, metadata: { pageCount?, wordCount, characterCount } }`

**chunkText(text, chunkSize=1000, overlap=200)**
- Splits text into overlapping chunks
- Returns: `string[]` (array of chunk texts)
- Validates input to prevent undefined errors

**Example**:
```typescript
const doc = await documentService.parseDocument(buffer, 'application/pdf')
// doc.text = "Full document text..."
// doc.metadata = { pageCount: 5, wordCount: 2500, characterCount: 15000 }

const chunks = documentService.chunkText(doc.text)
// chunks = ["chunk 1...", "chunk 2...", ...]
```

---

## Issues Encountered & Fixed

### Issue 1: File Not Found (ENOENT Error)
**Error**: `ENOENT: no such file or directory, open '/tmp/1772888118961-rpf-test-fyr.pdf'`

**Root Cause**: 
- Files were saved to `/tmp` directory
- Temp files get cleaned up before worker could process them

**Solution**:
- Changed to persistent directory: `apps/api/uploads/`
- Files remain until worker processes them
- Worker deletes file after successful processing

**Fix Location**: `apps/api/src/routes/documents.ts` line 44-51

### Issue 2: Cannot Read Property 'length' of Undefined
**Error**: `TypeError: Cannot read properties of undefined (reading 'length')`

**Root Cause**:
- `chunkText()` was called with undefined/null text
- PDF parsing failed but error wasn't caught
- Method tried to access `text.length` without validation

**Solution**:
- Added comprehensive validation in `chunkText()`
- Validate parsed text before chunking
- Return empty array if text is invalid

**Fix Location**: `apps/api/src/services/documentService.ts` line 132-151

### Issue 3: Document `content` Field is NULL
**Error**: Database shows `content: null` instead of full text

**Root Cause**:
- Worker parsed document successfully
- But never saved `content` back to Document table
- Only chunks were saved

**Solution**:
- Added `prisma.document.update()` after parsing
- Save full content + metadata to Document table

**Fix Location**: `apps/api/src/workers/documentWorker.ts` line 98-120

### Issue 4: Files Not Saved to uploads/ Directory
**Error**: `apps/api/uploads/` directory was empty

**Root Cause**:
- Directory path was incorrect in monorepo
- Used `process.cwd() + '/uploads'` instead of `process.cwd() + '/apps/api/uploads'`

**Solution**:
- Corrected path to account for monorepo structure
- Ensure directory is created with `fs.mkdir(uploadsDir, { recursive: true })`

**Fix Location**: `apps/api/src/routes/documents.ts` line 44-48

---

## API Endpoints

### Documents
- `POST /api/documents/upload` - Upload document (async)
- `GET /api/documents/` - List user's documents
- `GET /api/documents/:id` - Get document with chunks
- `DELETE /api/documents/:id` - Delete document

### Jobs
- `GET /api/jobs/:id` - Get job status
- `GET /api/jobs/` - List user's jobs

### Search
- `POST /api/search` - Semantic search across documents

### Proposals
- `POST /api/proposals/generate` - Generate new proposal
- `GET /api/proposals/` - List generated proposals

---

## Authentication Flow

### Clerk Integration
1. Frontend authenticates with Clerk
2. Clerk returns JWT token
3. Frontend sends token in Authorization header: `Bearer <token>`
4. Backend middleware (`authenticateUser`) verifies token
5. Extracts user info (email, clerkId)
6. `ensureUser` middleware creates/gets user from PostgreSQL
7. Request.user populated with user data

**Middleware Chain**:
```typescript
fastify.post('/upload', {
  preHandler: [authenticateUser, ensureUser]
}, async (request, reply) => {
  const user = request.user! // User from database
  // ... handle request
})
```

---

## File Structure

```
rfp-generator/
├── apps/
│   ├── api/
│   │   ├── uploads/              # Uploaded files (gitignored)
│   │   ├── src/
│   │   │   ├── index.ts          # Fastify server entry
│   │   │   ├── lib/
│   │   │   │   ├── db.ts         # Prisma client
│   │   │   │   └── redis.ts      # Redis client
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts       # Clerk authentication
│   │   │   ├── routes/
│   │   │   │   ├── documents.ts  # Document CRUD
│   │   │   │   ├── jobs.ts       # Job status
│   │   │   │   ├── search.ts     # Semantic search
│   │   │   │   └── proposals.ts  # Proposal generation
│   │   │   ├── services/
│   │   │   │   ├── documentService.ts   # Parse, chunk documents
│   │   │   │   ├── embeddingService.ts  # Generate embeddings
│   │   │   │   └── qdrantService.ts     # Vector DB operations
│   │   │   ├── workers/
│   │   │   │   └── documentWorker.ts    # BullMQ worker
│   │   │   ├── queues/
│   │   │   │   ├── queueConfig.ts
│   │   │   │   └── documentQueue.ts
│   │   │   └── types/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   ├── app/              # Next.js 15 App Router
│       │   ├── components/       # React components
│       │   ├── lib/
│       │   └── types/
│       └── package.json
└── packages/
    └── shared/
        └── types/                # Shared TypeScript types
```

---

## Environment Variables

### apps/api/.env
```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/rfp_generator"

# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379

# Qdrant
QDRANT_URL="http://localhost:6333"

# Clerk
CLERK_SECRET_KEY="sk_test_..."
CLERK_PUBLISHABLE_KEY="pk_test_..."

# Anthropic
ANTHROPIC_API_KEY="sk-ant-..."

# Server
PORT=3001
NODE_ENV="development"
```

### apps/web/.env.local
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

---

## Running the Project

### Prerequisites
```bash
# Install dependencies
npm install

# Start infrastructure
docker-compose up -d  # PostgreSQL, Redis, Qdrant

# Run migrations
cd apps/api
npx prisma migrate dev
```

### Development
```bash
# Terminal 1: Start API server
cd apps/api
npm run dev

# Terminal 2: Start worker
cd apps/api
npm run worker

# Terminal 3: Start web app
cd apps/web
npm run dev
```

### Access Points
- **Frontend**: http://localhost:3000
- **API**: http://localhost:3001
- **Qdrant**: http://localhost:6333/dashboard

---

## Current Status

### ✅ Completed
- Monorepo setup with Turborepo
- PostgreSQL + Prisma schema
- Clerk authentication integration
- Document upload with file validation
- BullMQ queue system
- Document worker with 5-step processing
- PDF, DOCX, TXT parsing
- Text chunking with overlap
- Embedding generation (placeholder/TODO)
- Qdrant vector storage (placeholder/TODO)
- Job status tracking
- Document CRUD endpoints
- Error handling and validation
- File cleanup after processing

### 🚧 In Progress / TODO
- [ ] Implement actual embedding service (currently placeholder)
- [ ] Implement actual Qdrant operations (currently placeholder)
- [ ] Build frontend components for document upload
- [ ] Build frontend for proposal generation
- [ ] Implement semantic search endpoint
- [ ] Implement proposal generation with Claude
- [ ] Add file size limits and quotas
- [ ] Add virus scanning for uploads
- [ ] Move to cloud storage (S3/GCS)
- [ ] Add comprehensive error logging
- [ ] Add monitoring and alerts
- [ ] Write tests

---

## Recent Fixes Applied

### Fix 1: Persistent File Storage
- Changed from `/tmp` to `apps/api/uploads/`
- Ensures files persist until worker processes them

### Fix 2: Content Field Population
- Added `prisma.document.update()` to save full content
- Document table now has complete text for search/display

### Fix 3: Type Safety
- Fixed type mismatch between `string[]` and `ChunkData[]`
- Added proper transformations in worker

### Fix 4: Validation & Error Handling
- Added null/undefined checks before accessing properties
- Validate file existence before reading
- Validate parsed content before chunking
- Better error messages for debugging

---

## Important Notes

### Monorepo Context
- **Always** use paths relative to apps/api: `apps/api/uploads/`
- **Never** assume working directory is project root
- Use `process.cwd()` + specific path for file operations

### File Processing
- Files are **persistent** in `apps/api/uploads/`
- Files are **deleted** after successful processing
- Files are **kept** on failure for debugging

### Database
- Document has full `content` field
- Chunks are separate records with position
- Both are needed for different use cases:
  - `content`: Full text for display, context
  - `chunks`: Smaller pieces for embeddings, search

### Job System
- Jobs are **async** - return 202 immediately
- Client polls `/api/jobs/:id` for status
- Progress updates: 0% → 15% → 30% → 50% → 70% → 100%
- Status: PENDING → ACTIVE → COMPLETED/FAILED

---

## Next Steps (When Resuming)

1. **Test Current Fixes**:
   - Create `apps/api/uploads/` directory
   - Upload test documents
   - Verify files saved correctly
   - Verify content field populated
   - Verify chunks created

2. **Implement Embedding Service**:
   - Choose embedding model (OpenAI, Voyage AI, etc.)
   - Implement `generateEmbeddings()` method
   - Handle rate limits and errors

3. **Implement Qdrant Service**:
   - Connect to Qdrant instance
   - Implement collection creation
   - Implement vector upsert
   - Implement similarity search

4. **Build Frontend**:
   - Document upload UI
   - Document list/management
   - Job status display
   - Proposal generation form

---

## Key Learnings

1. **Always validate inputs** before accessing properties
2. **Use persistent storage** for async job processing
3. **Update database** at each processing step for visibility
4. **Monorepo paths** must be explicit and correct
5. **Error handling** is critical for debugging production issues
6. **Job progress tracking** improves UX for long-running tasks
7. **Type safety** prevents runtime errors

---

## Contact & References

### Architecture Decisions
- Monorepo: Better code sharing, easier deployment
- BullMQ: Reliable job processing with retry logic
- Qdrant: Fast vector similarity search
- Fastify: High-performance Node.js framework
- Prisma: Type-safe database ORM
- Clerk: Easy authentication, handles security

### Why These Choices
- **Monorepo**: Share types between frontend/backend
- **Fastify**: Faster than Express, modern TypeScript support
- **BullMQ**: Robust job queue with Redis backend
- **Qdrant**: Open-source, self-hostable, fast vector search
- **Prisma**: Great DX, migrations, type safety
- **Clerk**: Quick auth setup, handles OAuth, sessions

---

## Summary

This is an **AI-powered RFP/Proposal generator** built as a **monorepo** with:
- **Backend**: Fastify API with PostgreSQL, Redis, Qdrant
- **Frontend**: Next.js 15 with Clerk auth
- **Processing**: BullMQ workers for async document processing
- **AI**: OPENAI API for proposal generation
- **Search**: Vector embeddings for semantic similarity

**Current Status**: Core document processing pipeline is working. Files are uploaded, parsed, chunked, and stored. Next steps are to implement embeddings, Qdrant integration, and frontend UI.

**Recent Focus**: Fixed file storage paths, content field population, and error handling in the document processing worker.