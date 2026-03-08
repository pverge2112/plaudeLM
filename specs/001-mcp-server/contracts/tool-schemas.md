# Tool Contracts: Knowledge Base Tools Interface

**Branch**: `001-mcp-server` | **Date**: 2026-03-07

These contracts define the exact Zod schemas for all 7 MCP tools. They are the **source of truth** (CONSTITUTION IV.5). FastAPI Pydantic models and Neo4j Cypher queries must conform to these shapes, not the reverse.

Contract tests in `mcp/tests/contract/tools/` must validate every schema below.

---

## Shared Types

```typescript
// Notebook enum — used across all tools
const NotebookSchema = z.enum(['kong', 'personal', 'music']);
type Notebook = z.infer<typeof NotebookSchema>;

// Citation — returned by query tool
const CitationSchema = z.object({
  chunk_id: z.string().uuid(),
  document_title: z.string(),
  chunk_text: z.string(),
  score: z.number().min(0).max(1),
  source_url: z.string().url().optional(),
});
type Citation = z.infer<typeof CitationSchema>;
```

---

## Tool: `ingest_document`

```typescript
// Input
const IngestDocumentInputSchema = z.object({
  source_type: z.enum(['pdf', 'url', 'markdown', 'gdrive']),
  notebook: NotebookSchema,
  title: z.string().min(1),
  content: z.string().optional(),
  url: z.string().url().optional(),
  file_id: z.string().optional(),
}).refine(
  (data) => {
    if (data.source_type === 'url') return !!data.url;
    if (data.source_type === 'gdrive') return !!data.file_id;
    if (data.source_type === 'markdown') return !!data.content;
    return true; // pdf: content or url, both optional at schema level
  },
  { message: 'Missing required field for source_type' }
);

// Output
const IngestDocumentOutputSchema = z.object({
  status: z.literal('ok'),
  chunks_ingested: z.number().int().min(0),
  concepts_extracted: z.number().int().min(0),
  title: z.string(),
});
```

---

## Tool: `query`

```typescript
// Input
const QueryInputSchema = z.object({
  question: z.string().min(1),
  notebook: NotebookSchema,
  top_k: z.number().int().min(1).max(20).optional().default(5),
});

// Output
const QueryOutputSchema = z.object({
  answer: z.string(),
  citations: z.array(CitationSchema),
  concepts_used: z.array(z.string()),
});
```

---

## Tool: `search_concepts`

```typescript
// Input
const SearchConceptsInputSchema = z.object({
  query: z.string().min(1),
  notebook: NotebookSchema.optional(),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

// Output
const SearchConceptsOutputSchema = z.object({
  concepts: z.array(z.object({
    name: z.string(),
    notebooks: z.array(z.string()),
    relationship_count: z.number().int().min(0),
  })),
});
```

---

## Tool: `add_relationship`

```typescript
// Input
const RelationshipTypeSchema = z.enum(['RELATED_TO', 'BROADER_THAN', 'LINKS_TO']);

const AddRelationshipInputSchema = z.object({
  from_concept: z.string().min(1),
  relationship: RelationshipTypeSchema,
  to_concept: z.string().min(1),
  notebook: NotebookSchema.optional(),
});

// Output
const AddRelationshipOutputSchema = z.object({
  status: z.literal('ok'),
  relationship_id: z.string(),
});
```

---

## Tool: `list_notebooks`

```typescript
// Input
const ListNotebooksInputSchema = z.object({});  // no fields

// Output
const ListNotebooksOutputSchema = z.object({
  notebooks: z.array(z.object({
    name: z.string(),
    chunk_count: z.number().int().min(0),
    document_count: z.number().int().min(0),
    concept_count: z.number().int().min(0),
  })),
});
```

---

## Tool: `get_document_graph`

```typescript
// Input
const GetDocumentGraphInputSchema = z.object({
  document_title: z.string().min(1),
  depth: z.number().int().min(1).max(3).optional().default(2),
});

// Output
const DocumentNodeSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  source_type: z.string(),
  source_url: z.string().url().optional(),
  notebook: z.string(),
  ingested_at: z.string().datetime(),
});

const ChunkNodeSchema = z.object({
  id: z.string().uuid(),
  chunk_index: z.number().int().min(0),
  notebook: z.string(),
  ingested_at: z.string().datetime(),
});

const ConceptNodeSchema = z.object({
  name: z.string(),
  notebooks: z.array(z.string()),
});

const RelationshipEdgeSchema = z.object({
  from_id: z.string(),
  to_id: z.string(),
  type: z.string(),
  weight: z.number().optional(),
});

const GetDocumentGraphOutputSchema = z.object({
  document: DocumentNodeSchema,
  chunks: z.array(ChunkNodeSchema),
  concepts: z.array(ConceptNodeSchema),
  relationships: z.array(RelationshipEdgeSchema),
});
```

---

## Tool: `audio_overview`

```typescript
// Input
const AudioOverviewInputSchema = z.object({
  notebook: NotebookSchema,
  topic: z.string().min(1),
});

// Output
const AudioOverviewOutputSchema = z.object({
  script: z.string().min(200),
  audio_path: z.string().min(1),
  duration_seconds: z.number().positive(),
});
```

---

## Contract Test Requirements

Each tool must have contract tests covering:

1. **Valid input accepted** — schema parses without error; inferred type is correct
2. **Invalid input rejected** — missing required fields, wrong types, out-of-range values
3. **Output shape validated** — mock backend responses parse against output schema
4. **Edge cases**:
   - `ingest_document`: url missing when source_type="url" → InvalidParams
   - `query`: top_k=0 → InvalidParams; top_k=21 → InvalidParams
   - `search_concepts`: empty query string → InvalidParams
   - `list_notebooks`: no input fields required; empty notebooks array is valid output
   - `get_document_graph`: depth=0 → InvalidParams; depth=4 → InvalidParams
   - `audio_overview`: script with <200 chars from backend → InternalError
