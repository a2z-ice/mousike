# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**mousike** (Greek for "music") — a composer assistant application built with Spring Boot 4.0.3, Spring AI 2.0.0-M2, Vaadin 25.0.5, and Java 21. It implements Modular RAG patterns with MCP (Model Context Protocol) architecture, deployed to a local Kind Kubernetes cluster with Ollama running on the host machine.

## Hard Constraints

- **NO Arconia**: Zero `io.arconia` dependencies anywhere. All Arconia functionality is replaced with manual Spring Boot config + Kind cluster services.
- **NO Testcontainers at runtime**: Services run in Kind cluster. Testcontainers are test-scope only.
- **NO Docker Ollama**: Ollama runs natively on the host at `localhost:11434`, accessible from pods via `host.docker.internal:11434`.
- **Anti-hallucination guardrails are mandatory**: Every RAG path must implement the 3-layer defence (Retrieval Gate, System Prompt, Output Validator). The LLM must NEVER be called when `retrievalResult.hasData() == false`.

## Architecture

### Two Spring Boot Applications (Gradle multi-project)

- **`mousike/`** — Main application (port 8080): Vaadin UI, REST API, MCP Client, Chat with JDBC memory, RAG advisors (naive/advanced/agentic), classification, extraction, semantic search
- **`document-service/`** — MCP Server (port 8091): Exposes tools via HTTP+SSE at `/mcp/sse`, document ingestion ETL pipeline (Tika → PGVector), vector store search tools

### MCP Flow
```
User Question → mousike-app (MCP Client) → Ollama (decides tool calls) → MCP Client executes tool → document-service (MCP Server) → PGVector → response back through chain
```

### Infrastructure (all in Kind cluster, namespace `rag`)
- PostgreSQL + pgvector (StatefulSet) — vector store + JPA entities
- Docling Serve — document parsing (PDF/DOCX → structured text)
- Phoenix (Arize) — LLM-specific observability (prompt/completion traces)
- Grafana LGTM — infrastructure observability (metrics/logs/traces)

## Build & Run Commands

```bash
# Build both projects
./gradlew build

# Build individual modules
./gradlew :mousike:build
./gradlew :document-service:build

# Build with Vaadin production mode
./gradlew :mousike:build -Pvaadin.productionMode=true

# Run locally (requires Ollama, Postgres running)
./gradlew :mousike:bootRun
./gradlew :document-service:bootRun

# Build container images for Kind
./gradlew :mousike:bootBuildImage --imageName=mousike-app:latest -Pvaadin.productionMode=true
./gradlew :document-service:bootBuildImage --imageName=document-service:latest

# Load images into Kind cluster
kind load docker-image mousike-app:latest --name mousike-cluster
kind load docker-image document-service:latest --name mousike-cluster

# Re-deploy after code changes
./gradlew :mousike:bootBuildImage --imageName=mousike-app:latest -Pvaadin.productionMode=true && \
kind load docker-image mousike-app:latest --name mousike-cluster && \
kubectl rollout restart deployment/mousike -n rag

# Run unit tests
./gradlew test
./gradlew :mousike:test --tests "com.example.mousike.rag.NaiveRagServiceTest"

# Run e2e tests (requires cluster running)
cd e2e && npx playwright test
npx playwright test --project=api   # API tests only
npx playwright test --project=ui    # UI tests only
```

## Key Technology Choices

| Concern | Solution |
|---|---|
| LLM Chat | Ollama with `llama3.2` model |
| Embeddings | Ollama with `nomic-embed-text` (768 dimensions) |
| Vector Store | PGVector with HNSW index, COSINE_DISTANCE |
| Chat Memory | JDBC via `spring-ai-starter-model-chat-memory-repository-jdbc` (20 message window) |
| MCP Transport | HTTP+SSE (`spring-ai-starter-mcp-client` / `spring-ai-starter-mcp-server-webmvc`) |
| Document Parsing | Tika via `spring-ai-tika-document-reader` |
| Observability | Dual export: Grafana LGTM (OTLP HTTP) + Phoenix (OTLP gRPC) |
| UI | Vaadin 25.0.5 embedded in Spring Boot jar (production mode build) |
| E2E Testing | Playwright with API + UI test projects |

## RAG Modes

- **Naive**: Direct embed → retrieve → generate (`QuestionAnswerAdvisor` with defaults)
- **Advanced**: Query rewrite + translation + score-based post-processing → generate
- **Agentic**: LLM-driven tool calling via MCP — Ollama decides which tools to invoke

## REST API Endpoints (mousike-app)

- `POST /api/chat` — Stateful chat with JDBC memory (`{"message": string, "conversationId"?: string}`)
- `POST /api/chat/stream` — Streaming chat (SSE)
- `DELETE /api/chat/{conversationId}` — Clear conversation memory
- `POST /api/rag/query?mode=naive|advanced|agentic` — RAG query (`{"question": string}`)
- `GET /api/search?q=...&category=...&topK=5` — Semantic search
- `POST /api/classify` — Instrument classification (`{"description": string}`)
- `POST /api/extract` — Composer data extraction (`{"text": string}`)

## Spring AI 2.0.0-M2 API Notes

- Use `SearchRequest.builder().query(...).topK(...).similarityThreshold(...).build()` (no static factory)
- Use `QuestionAnswerAdvisor` (not `RetrievalAugmentationAdvisor`)
- Use `JdbcChatMemoryRepository.builder().dataSource(ds).build()` for chat memory
- Use string literal `"chat_memory_conversation_id"` for memory advisor param key
- Use `ServiceAttributes` (not `ResourceAttributes`) for OTel semconv
- Use `TokenTextSplitter()` default constructor

## Observability Notes

Spring AI auto-instruments all AI operations when `spring.ai.*.observations.enabled=true`. The `ObservabilityConfig` adds a second `OtlpGrpcSpanExporter` bean for Phoenix alongside Spring Boot's built-in OTLP HTTP export to Grafana.

## Package Structure

Both modules share the base package `com.example.mousike`. Key packages in `mousike/`:
- `config/` — AiConfig (ChatClient beans), McpClientConfig, ObservabilityConfig
- `rag/` — NaiveRagService, AdvancedRagService, AgenticRagService
- `guardrails/` — RagRetrievalGate, OutputValidator, RetrievalResult
- `chat/` — ChatService (streaming + sync with JDBC memory)
- `ui/` — Vaadin views (ChatView, SearchView, ComposerView, MonitorView)

Key packages in `document-service/`:
- `tools/` — MusicKnowledgeTools (`@Tool` methods exposed via MCP)
- `config/` — McpServerConfig (registers tool beans)
- `ingestion/` — DocumentIngestionService (ETL pipeline), IngestionStartupRunner (`@Profile("ingestion")`)

## Kubernetes

All manifests are in `k8s/`. The Kind cluster is named `mousike-cluster`. All workloads deploy to namespace `rag`. Environment variables are driven by `k8s/configmap.yaml` (rag-config) and `k8s/secrets.yaml` (rag-secrets). Document ingestion runs as a Kubernetes Job with `--spring.profiles.active=ingestion,k8s`.

### Port Mappings (Kind NodePort → Host)
| Service | NodePort | Host Port |
|---|---|---|
| mousike-app | 30080 | 8080 |
| document-service | 30090 | 8091 |
| Grafana | 30300 | 3000 |
| OTLP HTTP | 30418 | 4318 |
| Phoenix | 30600 | 6006 |

## E2E Tests

Located in `e2e/`. Uses Playwright with two projects:
- **api**: Health checks, chat API, search, classify, extract, RAG, document-service
- **ui**: Navigation, Vaadin views (chat, search, composer, monitor)

Run with `cd e2e && npx playwright test`. Requires the Kind cluster to be running.
