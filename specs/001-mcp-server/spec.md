# Feature Specification: Knowledge Base Tools Interface

**Feature Branch**: `001-mcp-server`
**Created**: 2026-03-07
**Status**: Draft
**Input**: User description: "MCP Server (TypeScript) — expose all 7 plaudeLM tools via MCP protocol with dual transport (stdio for Claude Desktop/Code, HTTP/SSE for Kong MCP Gateway). Tools: ingest_document, query, search_concepts, add_relationship, list_notebooks, get_document_graph, audio_overview. Clients: FastAPI (for complex ops), Qdrant direct, Neo4j direct. Config: fail-fast env var validation. Containerized in Docker Compose. All 7 tools callable from Claude Desktop via stdio transport."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Query the Knowledge Base (Priority: P1)

Paul asks Claude a question about any topic in his knowledge base — Kong products, personal research, or music — and Claude retrieves a grounded, cited answer drawing on both stored documents and concept relationships.

**Why this priority**: This is the primary value of the entire system. Everything else (ingest, graph curation) exists to make this retrieval possible. Without working query access, the knowledge base has no interface.

**Independent Test**: Can be fully tested by asking Claude "What are Kong's key API gateway features?" against a notebook containing Kong docs and verifying that Claude returns a relevant answer with source citations.

**Acceptance Scenarios**:

1. **Given** Paul's knowledge base contains ingested documents in the `kong` notebook, **When** Paul asks Claude "What is Kong's rate limiting strategy?", **Then** Claude returns a direct answer with at least one citation referencing an ingested chunk.
2. **Given** Paul asks about a topic with no matching content, **When** the query runs, **Then** Claude clearly states no relevant content was found rather than hallucinating an answer.
3. **Given** Paul specifies a notebook (e.g., `music`), **When** the query runs, **Then** results are scoped to that notebook and do not include content from other notebooks.

---

### User Story 2 - Add a Document to the Knowledge Base (Priority: P2)

Paul asks Claude to add a new document — a PDF, a URL, a markdown note, or a Google Drive file — to a named notebook. The document is processed, chunked, and made searchable without Paul leaving his Claude conversation.

**Why this priority**: The knowledge base is only valuable if it can be populated. Ingest is the write path; without it, the system is read-only from day one and requires manual setup.

**Independent Test**: Can be fully tested by asking Claude to ingest a URL into the `personal` notebook and verifying that a subsequent query about that URL's content returns a cited answer.

**Acceptance Scenarios**:

1. **Given** Paul provides a valid URL, **When** he asks Claude to add it to the `personal` notebook, **Then** Claude confirms the document was ingested and reports how many chunks were extracted.
2. **Given** Paul provides an invalid source (missing URL, unsupported format), **When** ingest is attempted, **Then** Claude returns a clear error message explaining what went wrong.
3. **Given** a document is successfully ingested, **When** Paul queries related content immediately after, **Then** the new document's chunks appear in search results.

---

### User Story 3 - Browse and Curate Knowledge Graph Concepts (Priority: P3)

Paul asks Claude to search for concepts in the knowledge graph, see how they relate to each other, and manually add relationships between concepts to improve retrieval quality.

**Why this priority**: Graph curation is a secondary value-add over pure vector search. It enables Paul to make the knowledge base smarter over time, but basic query/ingest workflows are viable without it.

**Independent Test**: Can be fully tested by asking Claude to search for the concept "rate limiting" and verifying that related concepts and their notebook scopes are returned.

**Acceptance Scenarios**:

1. **Given** the knowledge graph contains ingested concepts, **When** Paul asks Claude to search for "API gateway", **Then** Claude returns a list of matching concepts with their notebook associations.
2. **Given** two concepts exist in the graph, **When** Paul asks Claude to add a "RELATED_TO" relationship between them, **Then** Claude confirms the relationship was created.
3. **Given** a document has been ingested, **When** Paul asks Claude to show the document's concept graph, **Then** Claude returns the document, its chunks, the concepts they mention, and the relationships between those concepts.

---

### User Story 4 - Inspect Notebook Status (Priority: P4)

Paul asks Claude to show the current state of all notebooks — how many documents and concepts each contains — so he knows what's in his knowledge base at a glance.

**Why this priority**: Operational visibility. Paul needs to confirm ingest results, check coverage, and plan what to add next. Lowest priority because it is diagnostic, not functional.

**Independent Test**: Can be fully tested by asking Claude "What's in my knowledge base?" and verifying that three notebooks (kong, personal, music) are returned with chunk and concept counts.

**Acceptance Scenarios**:

1. **Given** notebooks contain ingested content, **When** Paul asks Claude to list all notebooks, **Then** Claude returns the name, document count, chunk count, and concept count for each of the three notebooks.
2. **Given** a notebook is empty, **When** notebooks are listed, **Then** that notebook appears with zero counts rather than being omitted.

---

### Edge Cases

- What happens when the underlying query or ingest service is unavailable? The tool should return a clear error message, not hang or return a cryptic failure.
- What happens when a query matches no content in the specified notebook? The tool should return an empty result gracefully, not an error.
- What happens when a document has already been ingested (duplicate)? The ingest pipeline should handle deduplication; the tool reports success with the result.
- What happens when the knowledge base tool interface starts with missing configuration? It must refuse to start and report which configuration values are absent.
- What happens when a concept search returns no matches? An empty list is returned, not an error.
- What happens when the connection to the graph store or vector store is interrupted mid-query? The tool returns a structured error; the knowledge base interface remains available for other requests.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to query any notebook by name and receive a grounded answer with source citations from stored content.
- **FR-002**: Users MUST be able to ingest documents (URLs, PDFs, markdown, Google Drive files) into a named notebook via a single conversational request to Claude.
- **FR-003**: Users MUST be able to search knowledge graph concepts by keyword and receive matching concepts with their notebook associations and relationship counts.
- **FR-004**: Users MUST be able to manually add a typed relationship between any two concepts in the knowledge graph.
- **FR-005**: Users MUST be able to list all notebooks and see current document, chunk, and concept counts for each.
- **FR-006**: Users MUST be able to retrieve the full concept graph for a specific document — its chunks, the concepts they mention, and the relationships between those concepts.
- **FR-007**: Users MUST be able to request an audio overview for a notebook topic.
- **FR-008**: The interface MUST refuse to start if any required configuration value is absent, and MUST report which values are missing.
- **FR-009**: The interface MUST be accessible from Claude Desktop and Claude Code via a local direct connection.
- **FR-010**: The interface MUST also be accessible via a network-proxied connection (for Kong MCP Gateway), using the same 7 tools with identical behavior.
- **FR-011**: All tool inputs MUST be validated before execution; invalid inputs MUST return a structured error describing what was wrong.

### Key Entities

- **Notebook**: A named collection (kong, personal, music) that scopes all content — queries, concepts, and graph data are always associated with a notebook.
- **Tool**: A named capability exposed to Claude clients (query, ingest_document, search_concepts, add_relationship, list_notebooks, get_document_graph, audio_overview). Each tool has a defined input shape and output shape.
- **Citation**: A reference to a specific ingested chunk returned alongside a query answer, identifying the source document and the relevant text.
- **Concept**: A normalized term or phrase extracted from ingested content. Concepts are nodes in the knowledge graph, linked across notebooks and documents.
- **Relationship**: A directed, typed edge between two concepts in the knowledge graph (e.g., RELATED_TO, BROADER_THAN). Can be auto-extracted or manually added.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 7 knowledge base tools are callable from Claude Desktop with no configuration beyond adding the tool interface to Claude's settings — zero additional setup steps for Paul.
- **SC-002**: A query that matches existing content returns an answer with at least one citation within 60 seconds on the home lab hardware (CPU-only inference).
- **SC-003**: Ingesting a URL or markdown document and receiving confirmation takes no more than 90 seconds end-to-end.
- **SC-004**: 100% of tool calls with invalid inputs return a structured error visible in Claude's response — no silent failures, no raw stack traces.
- **SC-005**: The tool interface starts successfully when all required configuration is present, and fails with a human-readable message listing missing values when any are absent.
- **SC-006**: All 7 tools work identically whether accessed via local direct connection or via the network-proxied path — zero behavioral difference from Paul's perspective.
- **SC-007**: The tool interface runs as a containerized service alongside the rest of the stack and restarts automatically if it crashes.

## Assumptions

- The query service (Spec #3), ingest pipeline (Spec #2), and infrastructure (Spec #1) are fully deployed and operational before this interface is used.
- Paul's Claude Desktop installation supports the standard tool integration mechanism for local services.
- The audio overview tool delegates all audio generation to the query service; this spec only covers exposing the tool, not the audio generation logic itself (that is Spec #7).
- Notebook names are fixed: `kong`, `personal`, `music`. Adding new notebooks is out of scope for this spec.
- The network-proxied path (Kong MCP Gateway route) is configured separately in Spec #5; this spec only requires that the interface supports that transport mode.

## Out of Scope

- Kong MCP Gateway route configuration — covered in Spec #5.
- End-to-end tests — covered in Spec #6 (requires full Docker Compose stack).
- Audio text-to-speech generation — covered in Spec #7.
- Any custom web UI or dashboard.
- Adding new notebooks beyond the three defined (kong, personal, music).
- k3s / Kubernetes deployment manifests.
