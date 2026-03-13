# Mousike — Technical Deep Dive

> A comprehensive implementation guide for the Mousike AI-powered music assistant platform, covering every component, design decision, code pattern, and integration point.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [Project Structure & Build System](#3-project-structure--build-system)
4. [Spring AI Integration — ChatClient & ChatModel](#4-spring-ai-integration--chatclient--chatmodel)
5. [Chat System — Conversational Memory with JDBC](#5-chat-system--conversational-memory-with-jdbc)
6. [RAG Pipeline — Three Retrieval Strategies](#6-rag-pipeline--three-retrieval-strategies)
7. [Anti-Hallucination Guardrails — 3-Layer Defense](#7-anti-hallucination-guardrails--3-layer-defense)
8. [MCP (Model Context Protocol) — Client & Server](#8-mcp-model-context-protocol--client--server)
9. [Document Ingestion Pipeline](#9-document-ingestion-pipeline)
10. [Vector Store — PGVector with HNSW Indexing](#10-vector-store--pgvector-with-hnsw-indexing)
11. [Semantic Search Implementation](#11-semantic-search-implementation)
12. [LLM Structured Output — Classification & Extraction](#12-llm-structured-output--classification--extraction)
13. [Observability — OpenTelemetry, Phoenix & Grafana](#13-observability--opentelemetry-phoenix--grafana)
14. [Vaadin Web UI](#14-vaadin-web-ui)
15. [Kubernetes Deployment Architecture](#15-kubernetes-deployment-architecture)
16. [REST API Reference](#16-rest-api-reference)
17. [Data Flow Diagrams](#17-data-flow-diagrams)
18. [Testing Strategy](#18-testing-strategy)
19. [Troubleshooting Guide — End-to-End Debugging](#19-troubleshooting-guide--end-to-end-debugging)
    - [19.1 Application Health & Startup Failures](#191-application-health--startup-failures)
    - [19.2 Database & PGVector](#192-database--pgvector-troubleshooting)
    - [19.3 Chat System](#193-chat-system-troubleshooting)
    - [19.4 RAG Pipeline](#194-rag-pipeline-troubleshooting)
    - [19.5 Document Ingestion](#195-document-ingestion-troubleshooting)
    - [19.6 Docling Service](#196-docling-service-troubleshooting)
    - [19.7 MCP (Model Context Protocol)](#197-mcp-model-context-protocol-troubleshooting)
    - [19.8 Tracing & Observability](#198-tracing--observability-troubleshooting)
    - [19.9 Prometheus Metrics](#199-prometheus-metrics-troubleshooting)
    - [19.10 Semantic Search](#1910-semantic-search-troubleshooting)
    - [19.11 Kubernetes Cluster](#1911-kubernetes-cluster-troubleshooting)
    - [19.12 E2E Tests](#1912-e2e-test-troubleshooting)
    - [19.13 Build & Dependencies](#1913-build--dependency-troubleshooting)
    - [19.14 Troubleshooting Decision Tree](#1914-troubleshooting-decision-tree)
    - [19.15 Quick Health Check Script](#1915-quick-health-check-script)

---

## 1. Architecture Overview

Mousike is a two-service microservice platform that demonstrates production-grade AI/LLM application patterns using Spring Boot 4 and Spring AI 2.0.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User / Browser                              │
│                   (Vaadin UI or REST API calls)                     │
└──────────┬──────────────────────────────────────────────────────────┘
           │ HTTP :8080
           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    mousike-app (Spring Boot 4)                       │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────────┐   │
│  │  Chat    │  │   RAG    │  │  Search   │  │  Classification  │   │
│  │ Service  │  │ Pipeline │  │  Service  │  │  & Extraction    │   │
│  └────┬─────┘  └──┬───┬──┘  └─────┬─────┘  └────────┬─────────┘   │
│       │           │   │            │                  │              │
│       │     ┌─────┘   └─────┐      │                  │              │
│       ▼     ▼               ▼      ▼                  ▼              │
│  ┌────────────┐     ┌────────────────────┐   ┌───────────────┐      │
│  │  ChatClient │     │   Guardrails       │   │  ChatClient   │      │
│  │  + Memory   │     │ (3-layer defense)  │   │  (structured) │      │
│  └──────┬─────┘     └─────────┬──────────┘   └──────┬────────┘      │
│         │                     │                      │               │
│         └─────────┬───────────┘──────────────────────┘               │
│                   ▼                                                   │
│           ┌──────────────┐        ┌──────────────────┐              │
│           │  Ollama LLM  │        │  PGVector Store  │              │
│           │  (llama3.2)  │        │  (768-dim HNSW)  │              │
│           └──────────────┘        └──────────────────┘              │
│                                          ▲                           │
│                   MCP Client ────────────┼───────────────────────────│
│                   (SSE/HTTP)             │                           │
└──────────────────────┬───────────────────┼───────────────────────────┘
                       │                   │
                       ▼                   │
┌──────────────────────────────────────────┼───────────────────────────┐
│            document-service (:8090)      │                           │
│                                          │                           │
│  ┌────────────────┐  ┌──────────────┐    │                           │
│  │  Ingestion     │  │  MCP Server  │────┘                           │
│  │  Pipeline      │  │  (3 tools)   │                                │
│  │  (Tika→Chunk→  │  └──────────────┘                                │
│  │   Embed→Store) │                                                  │
│  └────────────────┘                                                  │
└──────────────────────────────────────────────────────────────────────┘
                       │
          ┌────────────┼────────────────┐
          ▼            ▼                ▼
  ┌──────────────┐ ┌──────────┐  ┌─────────────┐
  │  PostgreSQL  │ │  Ollama  │  │  Phoenix &  │
  │  + PGVector  │ │  (host)  │  │  Grafana    │
  └──────────────┘ └──────────┘  └─────────────┘
```

**Key architectural decisions:**
- **Two-service split**: mousike-app handles user interaction and LLM orchestration; document-service handles ingestion and exposes tools via MCP
- **MCP protocol**: Services communicate tool capabilities via the Model Context Protocol (SSE transport), allowing the LLM to dynamically discover and invoke tools
- **Shared database**: Both services read/write the same PGVector table in PostgreSQL, ensuring consistency
- **Local LLM**: Ollama runs on the host machine (not in K8s) to leverage GPU acceleration

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Framework** | Spring Boot | 4.0.3 | Application framework |
| **AI Framework** | Spring AI | 2.0.0-M2 | LLM abstraction, RAG advisors, chat memory |
| **Language** | Java | 21 | LTS with virtual threads support |
| **LLM** | Ollama + llama3.2 | latest | Chat model (4096 context window) |
| **Embeddings** | Ollama + nomic-embed-text | latest | 768-dimensional embeddings |
| **Vector DB** | PostgreSQL + PGVector | latest | HNSW index, cosine distance |
| **UI** | Vaadin | 25.0.5 | Server-side Java web framework |
| **MCP** | Spring AI MCP | 2.0.0-M2 | Tool protocol (client + server) |
| **Tracing** | OpenTelemetry | 1.55.0 | Distributed tracing |
| **Metrics** | Micrometer + Prometheus | 1.6.3 | Application metrics |
| **Trace UI** | Phoenix (Arize) | v13.14+ | LLM trace visualization |
| **Observability** | Grafana LGTM | v12.4+ | Metrics, logs, traces dashboard |
| **Orchestration** | Kubernetes (Kind) | latest | Container orchestration |

---

## 3. Project Structure & Build System

### Gradle Multi-Project Layout

```
mousike-platform/                      # Root project
├── build.gradle.kts                   # Root: Spring Boot 4.0.3, Java 21 toolchain
├── settings.gradle.kts                # Declares subprojects: mousike, document-service
├── mousike/                           # Main application (:8080)
│   └── build.gradle.kts
├── document-service/                  # Ingestion & MCP server (:8090)
│   └── build.gradle.kts
├── k8s/                               # Kubernetes manifests
├── e2e/                               # Playwright E2E tests
├── scripts/                           # Deployment scripts
└── docs/                              # Documentation
```

### Root build.gradle.kts

```kotlin
plugins {
    java
    id("org.springframework.boot") version "4.0.3" apply false
    id("io.spring.dependency-management") version "1.1.7" apply false
}

subprojects {
    apply(plugin = "java")
    group = "com.example.mousike"
    version = "1.0.0"

    java {
        toolchain {
            languageVersion = JavaLanguageVersion.of(21)
        }
    }

    repositories {
        mavenCentral()
        maven { url = uri("https://repo.spring.io/milestone") }
        maven { url = uri("https://repo.spring.io/snapshot") }
    }
}
```

### mousike/build.gradle.kts — Key Dependencies

```kotlin
dependencyManagement {
    imports {
        mavenBom("org.springframework.ai:spring-ai-bom:2.0.0-M2")  // Spring AI BOM
    }
}

dependencies {
    // Spring Boot Core
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.postgresql:postgresql")

    // Spring AI — Ollama (Chat + Embedding)
    implementation("org.springframework.ai:spring-ai-starter-model-ollama")

    // Spring AI — Vector Store (PGVector)
    implementation("org.springframework.ai:spring-ai-starter-vector-store-pgvector")

    // Spring AI — RAG Advisors (QuestionAnswerAdvisor)
    implementation("org.springframework.ai:spring-ai-advisors-vector-store")

    // Spring AI — Chat Memory (JDBC-backed persistence)
    implementation("org.springframework.ai:spring-ai-starter-model-chat-memory-repository-jdbc")

    // Spring AI — MCP Client (SSE transport)
    implementation("org.springframework.ai:spring-ai-starter-mcp-client")

    // Vaadin UI
    implementation("com.vaadin:vaadin-spring-boot-starter:25.0.5")

    // Observability — OpenTelemetry (Spring Boot 4 native starter)
    implementation("org.springframework.boot:spring-boot-starter-opentelemetry")
    implementation("io.micrometer:micrometer-tracing-bridge-otel")
    implementation("io.opentelemetry:opentelemetry-exporter-otlp")
    runtimeOnly("io.micrometer:micrometer-registry-prometheus")
}
```

**Why `spring-boot-starter-opentelemetry`?** Spring Boot 4 moved tracing auto-configuration into a dedicated starter. Without it, `SdkTracerProvider`, `OtelTracer`, and `TracingObservationHandler` beans are never created — metrics work (pull-based Prometheus scrape) but traces don't (push-based OTLP export).

---

## 4. Spring AI Integration — ChatClient & ChatModel

Spring AI provides `ChatClient` as the primary abstraction for interacting with LLMs. The application configures three distinct `ChatClient` beans, each with different system prompts and advisor chains.

### AiConfig.java — Core AI Configuration

```java
@Configuration
public class AiConfig {

    // JDBC-backed chat memory repository (persists to PostgreSQL)
    @Bean
    public JdbcChatMemoryRepository chatMemoryRepository(DataSource dataSource) {
        return JdbcChatMemoryRepository.builder()
                .dataSource(dataSource)
                .build();
    }

    // Window-based memory: keeps last 20 messages per conversation
    @Bean
    public ChatMemory chatMemory(JdbcChatMemoryRepository chatMemoryRepository) {
        return MessageWindowChatMemory.builder()
                .chatMemoryRepository(chatMemoryRepository)
                .maxMessages(20)
                .build();
    }

    // ChatClient #1: General chat with memory
    @Bean
    public ChatClient chatClient(ChatModel chatModel, ChatMemory chatMemory) {
        return ChatClient.builder(chatModel)
                .defaultSystem("""
                    You are Mousike, an AI assistant specialized in music, composers,
                    instruments, and music history. You answer questions thoughtfully,
                    citing sources when available.
                    When you don't know something, say so rather than guessing.
                    """)
                .defaultAdvisors(
                    MessageChatMemoryAdvisor.builder(chatMemory).build()
                )
                .build();
    }

    // ChatClient #2: RAG-specific with vector store advisor
    @Bean("ragChatClient")
    public ChatClient ragChatClient(ChatModel chatModel, VectorStore vectorStore,
                                     ChatMemory chatMemory) {
        return ChatClient.builder(chatModel)
                .defaultSystem("""
                    You are Mousike, an AI assistant for music.
                    Answer ONLY based on the provided context. If the context does not
                    contain enough information, say "I don't have enough information."
                    Do NOT hallucinate facts. Cite your sources.
                    """)
                .defaultAdvisors(
                    MessageChatMemoryAdvisor.builder(chatMemory).build(),
                    QuestionAnswerAdvisor.builder(vectorStore)
                        .searchRequest(SearchRequest.builder()
                            .similarityThreshold(0.50)
                            .topK(5)
                            .build())
                        .build()
                )
                .build();
    }
}
```

**How `ChatClient` works internally:**

1. `ChatClient.builder(chatModel)` — wraps the `OllamaChatModel` auto-configured by Spring AI
2. `.defaultSystem(...)` — sets a system message prepended to every prompt
3. `.defaultAdvisors(...)` — registers interceptors that modify the prompt/response chain:
   - `MessageChatMemoryAdvisor` — loads previous messages from memory before the call, saves new messages after
   - `QuestionAnswerAdvisor` — embeds the user question, searches PGVector, appends retrieved documents to the prompt

### How a chat call flows through advisors:

```
User calls: chatClient.prompt().user("What is a violin?").call()

Step 1: MessageChatMemoryAdvisor (BEFORE)
  → Loads previous messages from PostgreSQL for this conversation ID
  → Prepends them to the prompt

Step 2: QuestionAnswerAdvisor (BEFORE) [RAG only]
  → Embeds "What is a violin?" via nomic-embed-text
  → Queries PGVector for similar documents (cosine > 0.50)
  → Appends retrieved documents to the user prompt as context

Step 3: OllamaChatModel
  → Sends full prompt (system + history + context + question) to Ollama
  → Ollama/llama3.2 generates response

Step 4: MessageChatMemoryAdvisor (AFTER)
  → Saves user message + assistant response to PostgreSQL

Step 5: Response returned to caller
```

### Ollama Configuration (application.yml)

```yaml
spring:
  ai:
    ollama:
      base-url: ${SPRING_AI_OLLAMA_BASE_URL:http://localhost:11434}
      chat:
        model: llama3.2
        options:
          temperature: 0.7    # Balance between creativity and accuracy
          top-p: 0.9          # Nucleus sampling
          num-ctx: 4096        # Context window size
      embedding:
        model: nomic-embed-text  # 768-dimensional embeddings
```

---

## 5. Chat System — Conversational Memory with JDBC

### ChatService.java

```java
@Service
public class ChatService {

    private static final String CONVERSATION_ID_KEY = "chat_memory_conversation_id";

    private final ChatClient chatClient;
    private final ChatMemory chatMemory;

    public ChatService(ChatClient chatClient, ChatMemory chatMemory) {
        this.chatClient = chatClient;
        this.chatMemory = chatMemory;
    }

    // Streaming response (SSE)
    public Flux<String> chat(String conversationId, String userMessage) {
        return chatClient.prompt()
                .user(userMessage)
                .advisors(advisor -> advisor.param(CONVERSATION_ID_KEY, conversationId))
                .stream()
                .content();
    }

    // Synchronous response
    public String chatSync(String conversationId, String userMessage) {
        return chatClient.prompt()
                .user(userMessage)
                .advisors(advisor -> advisor.param(CONVERSATION_ID_KEY, conversationId))
                .call()
                .content();
    }

    public void clearHistory(String conversationId) {
        chatMemory.clear(conversationId);
    }
}
```

**Key implementation details:**

1. **Conversation isolation**: Each conversation has a UUID. The `CONVERSATION_ID_KEY` parameter is passed to the `MessageChatMemoryAdvisor`, which uses it to load/save messages from the correct row in PostgreSQL.

2. **JDBC persistence**: Chat memory is stored in PostgreSQL (not Redis or in-memory). Spring AI auto-creates the `SPRING_AI_CHAT_MEMORY` table via `initialize-schema: always`. This survives pod restarts.

3. **20-message window**: `MessageWindowChatMemory.maxMessages(20)` keeps only the last 20 messages per conversation, preventing context window overflow.

4. **Streaming**: `.stream().content()` returns a `Flux<String>` — tokens are sent as they're generated by Ollama, enabling real-time UI updates via SSE.

### ChatController.java

```java
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    @PostMapping
    public ResponseEntity<Map<String, String>> chat(@RequestBody Map<String, String> request) {
        String message = request.get("message");
        String conversationId = request.getOrDefault("conversationId",
            UUID.randomUUID().toString());
        // ...
        String response = chatService.chatSync(conversationId, message);
        return ResponseEntity.ok(Map.of("response", response, "conversationId", conversationId));
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> chatStream(@RequestBody Map<String, String> request) { ... }

    @DeleteMapping("/{conversationId}")
    public ResponseEntity<Void> clearHistory(@PathVariable String conversationId) { ... }
}
```

---

## 6. RAG Pipeline — Three Retrieval Strategies

The application implements three RAG modes, progressively increasing in capability:

### Mode 1: Naive RAG

The simplest approach. Retrieves documents, asks the LLM, validates the output.

```java
@Service
public class NaiveRagService {

    private final ChatClient chatClient;           // ragChatClient (has QuestionAnswerAdvisor)
    private final RagRetrievalGate retrievalGate;  // Layer 1
    private final OutputValidator outputValidator;  // Layer 3

    public String query(String question) {
        // Layer 1: Retrieval Gate — check if we have relevant data
        var retrieval = retrievalGate.retrieve(question, 5);
        if (!retrieval.hasData()) {
            return RetrievalResult.NO_DATA_RESPONSE;
        }

        // Layer 2: System prompt instructs LLM to refuse if context is weak
        String answer = chatClient.prompt()
                .user(question)
                .call()
                .content();

        // Layer 3: Output validation — check grounding ratio
        var validation = outputValidator.validate(answer, retrieval.documents());
        if (!validation.valid()) {
            return RetrievalResult.NO_DATA_RESPONSE;
        }

        return answer;
    }
}
```

**Flow**: `question → retrieval gate (0.65 threshold, min 2 chunks) → LLM call (with auto-retrieved context via QuestionAnswerAdvisor) → output validation (30% grounding check) → response`

### Mode 2: Advanced RAG

Stricter parameters and more documents:

```java
@Service
public class AdvancedRagService {

    public AdvancedRagService(ChatModel chatModel, VectorStore vectorStore, ...) {
        // Constructs its own ChatClient with higher-quality retrieval
        var advisor = QuestionAnswerAdvisor.builder(vectorStore)
                .searchRequest(SearchRequest.builder()
                        .similarityThreshold(0.65)  // Higher than naive (0.50)
                        .topK(10)                    // More documents than naive (5)
                        .build())
                .build();

        this.chatClient = ChatClient.builder(chatModel)
                .defaultSystem("Answer based ONLY on the retrieved context...")
                .defaultAdvisors(advisor)
                .build();
    }

    public String query(String question) {
        // Same 3-layer pattern as Naive
        var retrieval = retrievalGate.retrieve(question, 10);  // topK=10
        if (!retrieval.hasData()) return NO_DATA_RESPONSE;
        String answer = chatClient.prompt().user(question).call().content();
        var validation = outputValidator.validate(answer, retrieval.documents());
        if (!validation.valid()) return NO_DATA_RESPONSE;
        return answer;
    }
}
```

**Differences from Naive:**
| Parameter | Naive | Advanced |
|---|---|---|
| Similarity threshold | 0.50 | 0.65 |
| Top-K documents | 5 | 10 |
| Retrieval gate topK | 5 | 10 |

### Mode 3: Agentic RAG (MCP Tool-Calling)

The LLM autonomously decides which tools to call:

```java
@Service
public class AgenticRagService {

    private final ChatClient agenticChatClient;  // Has MCP tool callbacks
    private final ChatMemory chatMemory;

    public String query(String conversationId, String question) {
        return agenticChatClient.prompt()
                .user(question)
                .advisors(advisor -> advisor.param(CONVERSATION_ID_KEY, conversationId))
                .call()
                .content();
    }
}
```

**How Agentic RAG works:**

1. The `agenticChatClient` has `SyncMcpToolCallbackProvider` registered as default tool callbacks
2. When the LLM receives the user question, it sees the available MCP tools in its system prompt
3. The LLM decides to call `searchMusicKnowledge(query="...", topK=5, minScore=0.65)` or `searchByCategory(query="...", category="composers")`
4. Spring AI intercepts the tool call, forwards it via MCP/SSE to the document-service
5. The document-service executes the vector search and returns results
6. The LLM receives the tool results and generates a final answer

This is the most flexible mode — the LLM can chain multiple tool calls, search different categories, and adjust search parameters.

### RagController.java — Mode Routing

```java
@PostMapping("/query")
public ResponseEntity<Map<String, String>> query(
        @RequestParam(defaultValue = "advanced") String mode,
        @RequestParam(required = false, defaultValue = "default") String conversationId,
        @RequestBody Map<String, String> request) {

    String answer = switch (mode) {
        case "naive"   -> naiveRagService.query(question);
        case "agentic" -> agenticRagService.query(conversationId, question);
        default        -> advancedRagService.query(question);  // "advanced"
    };

    return ResponseEntity.ok(Map.of("question", question, "answer", answer, "mode", mode));
}
```

---

## 7. Anti-Hallucination Guardrails — 3-Layer Defense

Every RAG query passes through three independent validation layers:

```
    User Question
         │
         ▼
┌─────────────────────────────────────────┐
│  LAYER 1: Retrieval Gate                │
│  • Vector search with 0.65 threshold    │
│  • Requires ≥ 2 chunks above threshold  │
│  • BLOCKS if no relevant data exists    │
└─────────────────┬───────────────────────┘
                  │ (passes)
                  ▼
┌─────────────────────────────────────────┐
│  LAYER 2: System Prompt Instruction     │
│  • "Answer ONLY from provided context"  │
│  • "Say I don't know if insufficient"   │
│  • "Do NOT hallucinate facts"           │
└─────────────────┬───────────────────────┘
                  │ (LLM generates)
                  ▼
┌─────────────────────────────────────────┐
│  LAYER 3: Output Validator              │
│  • Checks response is not empty         │
│  • Accepts valid refusals ("I don't     │
│    have enough information")            │
│  • Grounding check: ≥ 30% of content   │
│    words must appear in source chunks   │
│  • BLOCKS if grounding ratio < 0.30    │
└─────────────────┬───────────────────────┘
                  │ (validated)
                  ▼
           Response to User
```

### Layer 1: RagRetrievalGate

```java
@Component
public class RagRetrievalGate {

    private static final double MINIMUM_SCORE_THRESHOLD = 0.65;
    private static final int MINIMUM_CHUNK_COUNT = 2;

    public RetrievalResult retrieve(String query, int topK) {
        List<Document> candidates = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query(query)
                        .topK(topK)
                        .similarityThreshold(MINIMUM_SCORE_THRESHOLD)
                        .build()
        );

        if (candidates.isEmpty()) {
            return RetrievalResult.noData(query,
                "No results above threshold " + MINIMUM_SCORE_THRESHOLD);
        }

        if (candidates.size() < MINIMUM_CHUNK_COUNT) {
            return RetrievalResult.lowConfidence(query, candidates,
                "Only " + candidates.size() + " chunk(s) found, minimum is " + MINIMUM_CHUNK_COUNT);
        }

        return RetrievalResult.withData(query, candidates);
    }
}
```

**Design rationale**: A single chunk match could be coincidental. Requiring 2+ chunks ensures the knowledge base has substantive coverage of the topic.

### Layer 3: OutputValidator

```java
@Component
public class OutputValidator {

    public ValidationResult validate(String llmResponse, List<Document> retrievedChunks) {
        // Empty response → invalid
        if (llmResponse == null || llmResponse.isBlank())
            return new ValidationResult(false, "Empty response from LLM");

        // Valid refusals are acceptable
        if (lower.contains("i don't have enough information") ||
            lower.contains("i don't know"))
            return new ValidationResult(true, "Valid refusal response");

        // Grounding check: count words from response that appear in chunks
        String allChunkText = retrievedChunks.stream()
                .map(Document::getText)
                .reduce("", (a, b) -> a + " " + b).toLowerCase();

        long contentWords = 0, groundedWords = 0;
        for (String word : responseWords) {
            if (word.length() > 4) {     // Skip common/short words
                contentWords++;
                if (allChunkText.contains(word)) {
                    groundedWords++;
                }
            }
        }

        double groundingRatio = (double) groundedWords / contentWords;
        if (groundingRatio < 0.3)  // Less than 30% grounded → reject
            return new ValidationResult(false,
                String.format("Low grounding ratio: %.2f", groundingRatio));

        return new ValidationResult(true, String.format("Grounding ratio: %.2f", groundingRatio));
    }
}
```

**How grounding works**: If the LLM generates a 100-word answer and only 20 significant words (>4 characters) appear in the retrieved chunks, the grounding ratio is 20%. Since this is below 30%, the response is rejected and the safe fallback message is returned instead.

### RetrievalResult Record

```java
public record RetrievalResult(
    String query,
    List<Document> documents,
    boolean hasData,
    boolean lowConfidence,
    String reason
) {
    public static final String NO_DATA_RESPONSE =
        "I don't have enough information in my knowledge base to answer that question accurately. " +
        "Please try rephrasing your question or ask about a different music topic.";

    public static RetrievalResult noData(String query, String reason) { ... }
    public static RetrievalResult lowConfidence(String query, List<Document> docs, String reason) { ... }
    public static RetrievalResult withData(String query, List<Document> docs) { ... }
}
```

---

## 8. MCP (Model Context Protocol) — Client & Server

MCP enables the mousike-app to discover and invoke tools exposed by the document-service at runtime. The LLM decides when and how to call these tools.

### Server Side (document-service)

#### McpServerConfig.java

```java
@Configuration
public class McpServerConfig {

    @Bean
    public ToolCallbackProvider musicKnowledgeToolProvider(MusicKnowledgeTools tools) {
        return MethodToolCallbackProvider.builder()
                .toolObjects(tools)
                .build();
    }
}
```

This registers all `@Tool`-annotated methods in `MusicKnowledgeTools` as MCP tool endpoints.

#### MusicKnowledgeTools.java — Three MCP Tools

```java
@Component
public class MusicKnowledgeTools {

    // Tool 1: General semantic search
    @Tool(name = "searchMusicKnowledge",
          description = "Search the music knowledge base for information about composers, ...")
    public String searchMusicKnowledge(
            @ToolParam(description = "The search query") String query,
            @ToolParam(description = "Max results, default 5") int topK,
            @ToolParam(description = "Min similarity 0.0-1.0, default 0.65") double minScore) {

        List<Document> results = vectorStore.similaritySearch(
            SearchRequest.builder()
                .query(query).topK(topK > 0 ? topK : 5)
                .similarityThreshold(minScore > 0 ? minScore : 0.65)
                .build());

        return results.stream()
            .map(doc -> String.format("[Source: %s, Score: %s]\n%s",
                doc.getMetadata().get("source"), doc.getMetadata().get("distance"), doc.getText()))
            .collect(Collectors.joining("\n\n---\n\n"));
    }

    // Tool 2: Category-filtered search
    @Tool(name = "searchByCategory",
          description = "Search filtered by category: composers, instruments, theory, ...")
    public String searchByCategory(
            @ToolParam(description = "Search query") String query,
            @ToolParam(description = "Category filter") String category) {

        var filterExpression = new FilterExpressionBuilder().eq("category", category).build();
        // ... search with filter ...
    }

    // Tool 3: List available knowledge sources
    @Tool(name = "listAvailableDocuments",
          description = "List documents available in the knowledge base")
    public String listAvailableDocuments() { ... }
}
```

#### MCP Server Configuration (application.yml)

```yaml
spring:
  ai:
    mcp:
      server:
        enabled: true
        name: document-service
        version: "1.0.0"
```

This auto-configures the MCP server endpoint at `/mcp/sse` (HTTP+SSE transport).

### Client Side (mousike-app)

#### McpClientConfig.java

```java
@Configuration
public class McpClientConfig {

    @Bean("agenticChatClient")
    public ChatClient agenticChatClient(
            ChatModel chatModel,
            ChatMemory chatMemory,
            SyncMcpToolCallbackProvider mcpToolCallbackProvider) {

        return ChatClient.builder(chatModel)
                .defaultSystem("""
                    You are Mousike, an AI assistant for music. You have access to a music
                    knowledge base through tools. Use the tools to find accurate information
                    before answering. Always cite your sources.
                    Available tools: searchMusicKnowledge, searchByCategory, listAvailableDocuments.
                    """)
                .defaultToolCallbacks(mcpToolCallbackProvider)
                .build();
    }
}
```

#### MCP Client Configuration (application.yml)

```yaml
spring:
  ai:
    mcp:
      client:
        enabled: true
        name: mousike-mcp-client
        version: "1.0.0"
        request-timeout: 30s
        type: SYNC
        sse:
          connections:
            document-service:
              url: ${DOCUMENT_SERVICE_URL:http://localhost:8090}/mcp/sse
```

### MCP Call Flow

```
1. User asks: "Tell me about Bach"
2. agenticChatClient sends prompt + tool definitions to Ollama
3. Ollama decides to call: searchMusicKnowledge(query="Bach biography", topK=5, minScore=0.65)
4. Spring AI intercepts the tool_call response
5. Spring AI sends MCP request via SSE to document-service:8090/mcp/sse
6. document-service executes vector search → returns formatted results
7. Spring AI passes tool results back to Ollama
8. Ollama generates final answer using the tool results
9. Response returned to user
```

---

## 9. Document Ingestion Pipeline

### DocumentIngestionService.java

```java
@Service
public class DocumentIngestionService {

    private final VectorStore vectorStore;
    private final TokenTextSplitter textSplitter = new TokenTextSplitter();

    public IngestionResult ingest(Resource resource, String category) {
        // Step 1: Parse PDF/DOCX with Apache Tika
        var reader = new TikaDocumentReader(resource);
        List<Document> rawDocs = reader.get();

        // Step 2: Enrich with metadata
        List<Document> enrichedDocs = rawDocs.stream()
                .map(doc -> {
                    doc.getMetadata().put("source", resource.getFilename());
                    doc.getMetadata().put("category", category);
                    doc.getMetadata().put("ingested_at", System.currentTimeMillis());
                    return doc;
                }).toList();

        // Step 3: Split into chunks (token-aware boundaries)
        List<Document> chunks = textSplitter.apply(enrichedDocs);

        // Step 4: Generate embeddings + store in PGVector (automatic)
        vectorStore.accept(chunks);

        return new IngestionResult(resource.getFilename(), chunks.size(), true, null);
    }
}
```

### What happens inside `vectorStore.accept(chunks)`:

1. Spring AI's `PgVectorStore` receives the list of `Document` objects
2. For each document, it calls `EmbeddingModel.embed(document.getText())` → sends to Ollama's `/api/embed` endpoint using `nomic-embed-text`
3. Ollama returns a 768-dimensional float vector
4. `PgVectorStore` executes `INSERT INTO vector_store (id, content, metadata, embedding) VALUES (?, ?, ?::jsonb, ?::vector)` via JDBC
5. PGVector's HNSW index is updated automatically

### Ingestion Controller

```java
@PostMapping("/api/ingest")
public ResponseEntity<Map<String, Object>> ingest(
    @RequestParam("file") MultipartFile file,
    @RequestParam(defaultValue = "general") String category) {

    Resource resource = file.getResource();
    var result = ingestionService.ingest(resource, category);

    return ResponseEntity.ok(Map.of(
        "filename", result.filename(),
        "chunksIngested", result.chunksIngested(),
        "success", result.success()
    ));
}
```

---

## 10. Vector Store — PGVector with HNSW Indexing

### Configuration

```yaml
spring:
  ai:
    vectorstore:
      pgvector:
        index-type: HNSW              # Hierarchical Navigable Small World
        distance-type: COSINE_DISTANCE # Cosine similarity (1 - cosine distance)
        dimensions: 768                # nomic-embed-text output dimensions
        initialize-schema: true        # Auto-create vector_store table
        schema-name: public
        table-name: vector_store
        max-document-batch-size: 10000
      observations:
        enabled: true                  # Emit metrics for vector operations
```

### Database Schema (auto-created)

```sql
CREATE TABLE IF NOT EXISTS vector_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT,
    metadata JSONB,
    embedding vector(768)
);

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS vector_store_embedding_idx
    ON vector_store USING hnsw (embedding vector_cosine_ops);
```

### How similarity search works

When `VectorStore.similaritySearch()` is called:

1. The query string is embedded: `nomic-embed-text("What is a violin?")` → `[0.023, -0.045, 0.091, ...]` (768 floats)
2. PGVector executes: `SELECT id, content, metadata, 1 - (embedding <=> $1) AS similarity FROM vector_store WHERE 1 - (embedding <=> $1) >= $2 ORDER BY embedding <=> $1 LIMIT $3`
3. `<=>` is the cosine distance operator; `1 - distance` = similarity
4. HNSW index makes this O(log n) instead of O(n)

---

## 11. Semantic Search Implementation

### SemanticSearchService.java

```java
@Service
public class SemanticSearchService {

    private final VectorStore vectorStore;

    public List<Map<String, Object>> search(String query, String category, int topK) {
        var searchBuilder = SearchRequest.builder()
                .query(query)
                .topK(topK)
                .similarityThreshold(0.60);

        // Optional category filter
        if (category != null && !category.isBlank()) {
            var filterBuilder = new FilterExpressionBuilder();
            searchBuilder.filterExpression(filterBuilder.eq("category", category).build());
        }

        List<Document> results = vectorStore.similaritySearch(searchBuilder.build());

        return results.stream().map(doc -> Map.of(
            "content", (Object) doc.getText(),
            "metadata", doc.getMetadata()
        )).toList();
    }
}
```

**Filter expressions**: `FilterExpressionBuilder.eq("category", "composers")` generates a SQL WHERE clause that filters on the JSONB metadata column: `metadata->>'category' = 'composers'`. This allows scoped searches within specific document categories.

---

## 12. LLM Structured Output — Classification & Extraction

### Instrument Classification

The LLM acts as a multi-class classifier using a system prompt that constrains output format:

**System prompt** (`prompts/system-classifier.st`):
```
You are a music instrument classification expert.
Given a description of a musical instrument, classify it into one of these categories:
STRING, WOODWIND, BRASS, PERCUSSION, KEYBOARD, ELECTRONIC, VOCAL.
Respond with ONLY a JSON object with category, confidence, and reasoning fields.
```

```java
@Component
public class InstrumentClassifier {
    private final ChatClient chatClient;

    public InstrumentClassifier(ChatModel chatModel) {
        this.chatClient = ChatClient.builder(chatModel)
            .defaultSystem(/* system-classifier.st content */)
            .build();
    }

    public String classify(String description) {
        return chatClient.prompt().user(description).call().content();
    }
}
```

**Example input/output:**
```
Input:  "A wooden instrument with four strings tuned in fifths, played with a bow"
Output: {"category": "STRING", "confidence": 0.98, "reasoning": "Four strings tuned in fifths
         with a bow is characteristic of the violin family (violin, viola, cello)"}
```

### Composer Data Extraction

**System prompt** (`prompts/system-extractor.st`):
```
You are a music data extraction expert.
Given text about a composer, extract structured information.
Respond with ONLY a JSON object containing: name, birthYear, deathYear, nationality,
era, notableWorks, instruments. If a field is unknown, use null.
```

```java
@Component
public class ComposerExtractor {
    public String extract(String text) {
        return chatClient.prompt().user(text).call().content();
    }
}
```

**Example input/output:**
```
Input:  "Beethoven composed his 9th Symphony in 1824, featuring the famous Ode to Joy"
Output: {"name": "Ludwig van Beethoven", "birthYear": 1770, "deathYear": 1827,
         "nationality": "German", "era": "Classical/Romantic",
         "notableWorks": ["Symphony No. 9"], "instruments": null}
```

---

## 13. Observability — OpenTelemetry, Phoenix & Grafana

### ObservabilityConfig.java — Dual Exporter Setup

```java
@Configuration
public class ObservabilityConfig {

    @Value("${PHOENIX_OTLP_HTTP_URL:http://localhost:6006}")
    private String phoenixOtlpUrl;

    @Value("${GRAFANA_OTLP_HTTP_URL:http://localhost:4318}")
    private String grafanaOtlpUrl;

    // Exporter 1: Phoenix (LLM trace visualization)
    @Bean
    public SpanExporter phoenixSpanExporter() {
        return OtlpHttpSpanExporter.builder()
                .setEndpoint(phoenixOtlpUrl + "/v1/traces")
                .setTimeout(Duration.ofSeconds(10))
                .build();
    }

    // Exporter 2: Grafana Tempo (distributed tracing)
    @Bean
    public SpanExporter grafanaSpanExporter() {
        return OtlpHttpSpanExporter.builder()
                .setEndpoint(grafanaOtlpUrl + "/v1/traces")
                .setTimeout(Duration.ofSeconds(10))
                .build();
    }

    @Bean
    public Resource otelResource() {
        return Resource.getDefault().merge(
            Resource.create(Attributes.of(
                ServiceAttributes.SERVICE_NAME, "mousike",
                ServiceAttributes.SERVICE_VERSION, "1.0.0",
                AttributeKey.stringKey("deployment.environment"), "local-kind"
            )));
    }
}
```

**Why two exporters?** Phoenix provides AI-specific trace visualization (LLM call details, prompt/completion text). Grafana Tempo provides general distributed tracing (HTTP request flow, latencies). Both receive the same spans.

### Spring AI Observation Configuration

```yaml
spring:
  ai:
    chat:
      observations:
        enabled: true
        include-prompt: true        # Include prompt text in traces
        include-completion: true    # Include response text in traces
    embedding:
      observations:
        enabled: true
    vectorstore:
      observations:
        enabled: true

management:
  tracing:
    sampling:
      probability: 1.0             # 100% of traces exported
```

### What gets traced

Every Spring AI operation creates OpenTelemetry spans:

| Span Name | Created By | Attributes |
|---|---|---|
| `chat llama3.2` | `OllamaChatModel` | `gen_ai.operation.name=chat`, `gen_ai.request.model=llama3.2` |
| `embedding` | `OllamaEmbeddingModel` | `gen_ai.operation.name=embedding`, `gen_ai.request.model=nomic-embed-text` |
| `pg_vector query` | `PgVectorStore` | `db.system=pg_vector`, `db.operation=query` |
| `http post /api/chat` | Spring MVC | `http.method=POST`, `http.url=/api/chat` |

### Prometheus Metrics

Available at `GET /actuator/prometheus`:

```
# LLM call count and latency
gen_ai_client_operation_seconds_count{gen_ai_operation_name="chat"} 42
gen_ai_client_operation_seconds_sum{gen_ai_operation_name="chat"} 186.5
gen_ai_client_operation_seconds_count{gen_ai_operation_name="embedding"} 35

# Vector store operations
db_vector_client_operation_seconds_count{db_system="pg_vector"} 28

# HTTP requests
http_server_requests_seconds_count{uri="/api/chat"} 15
```

---

## 14. Vaadin Web UI

### MainLayout.java — Application Shell

```java
@Layout
public class MainLayout extends AppLayout {
    public MainLayout() {
        // Header
        var logo = new H1("Mousike");
        var toggle = new DrawerToggle();
        addToNavbar(toggle, logo);

        // Navigation drawer
        addToDrawer(new VerticalLayout(
            new RouterLink("Chat", ChatView.class),
            new RouterLink("Search", SearchView.class),
            new RouterLink("Composers", ComposerView.class),
            new RouterLink("Monitor", MonitorView.class)
        ));
    }
}
```

### ChatView.java — Real-time Streaming Chat

The chat view demonstrates Vaadin's server-push capability with streaming LLM responses:

```java
@Route(value = "chat", layout = MainLayout.class)
public class ChatView extends VerticalLayout {
    private final ChatService chatService;
    private String conversationId = UUID.randomUUID().toString();
    private Div messageContainer;

    // When user sends a message:
    private void sendMessage(String message) {
        addMessage("You", message, "user-message");
        Div assistantDiv = addMessage("Mousike", "", "assistant-message");

        // Stream tokens in real-time via Vaadin server push
        chatService.chat(conversationId, message)
            .subscribe(
                token -> getUI().ifPresent(ui ->
                    ui.access(() -> {
                        assistantDiv.getElement()
                            .setProperty("innerHTML",
                                assistantDiv.getElement().getProperty("innerHTML") + token);
                    })),
                error -> { /* handle error */ },
                () -> { /* complete */ }
            );
    }
}
```

### Views Summary

| Route | View | Features |
|---|---|---|
| `/chat` | ChatView | Streaming chat, conversation memory, clear history |
| `/search` | SearchView | Semantic search with category filter, results grid |
| `/composer` | ComposerView | Text input → structured JSON extraction |
| `/monitor` | MonitorView | Links to Phoenix, Grafana, actuator health |

---

## 15. Kubernetes Deployment Architecture

### Cluster Topology

```
Kind Cluster (mousike-cluster)
├── Control Plane Node
├── Worker Node 1
└── Worker Node 2

Namespace: rag
├── mousike (Deployment, 1 replica)           → NodePort 30080 → :8080
├── document-service (Deployment, 1 replica)  → NodePort 30090 → :8091
├── postgres-0 (StatefulSet, 1 replica)       → ClusterIP :5432
├── redis (Deployment, 1 replica)             → ClusterIP :6379
├── docling (Deployment, 1 replica)           → ClusterIP :5001
├── phoenix (Deployment, 1 replica)           → NodePort 30600 → :6006
└── grafana-lgtm (Deployment, 1 replica)      → NodePort 30300 → :3000
```

### Service Communication

```yaml
# k8s/configmap.yaml
data:
  OLLAMA_BASE_URL: "http://host.docker.internal:11434"  # Host machine GPU
  POSTGRES_HOST: "postgres-service"
  DOCLING_BASE_URL: "http://docling-service:5001"
  PHOENIX_OTLP_HTTP_URL: "http://phoenix-service:6006"
  GRAFANA_OTLP_HTTP_URL: "http://grafana-lgtm-service:4318"
  DOCUMENT_SERVICE_URL: "http://document-service:8090"
```

### Deployment Script

```bash
#!/bin/bash
# scripts/cluster-up.sh
kind create cluster --config k8s/kind-config.yaml
kubectl create namespace rag
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/redis/
kubectl apply -f k8s/docling/
kubectl apply -f k8s/phoenix/
kubectl apply -f k8s/grafana/

# Build and load application images
./gradlew :mousike:bootBuildImage --imageName=mousike-app:latest
./gradlew :document-service:bootBuildImage --imageName=document-service:latest
kind load docker-image mousike-app:latest --name mousike-cluster
kind load docker-image document-service:latest --name mousike-cluster

kubectl apply -f k8s/document-service/
kubectl apply -f k8s/mousike/
```

### Port Mapping (Kind NodePorts → localhost)

| Service | Container Port | NodePort | localhost URL |
|---|---|---|---|
| Mousike App | 8080 | 30080 | http://localhost:8080 |
| Document Service | 8090 | 30090 | http://localhost:8091 |
| Phoenix | 6006 | 30600 | http://localhost:6006 |
| Grafana | 3000 | 30300 | http://localhost:3000 |

---

## 16. REST API Reference

### mousike-app (:8080)

| Method | Endpoint | Description | Body |
|---|---|---|---|
| `POST` | `/api/chat` | Send chat message | `{"message": "...", "conversationId": "..."}` |
| `POST` | `/api/chat/stream` | Stream chat (SSE) | `{"message": "...", "conversationId": "..."}` |
| `DELETE` | `/api/chat/{id}` | Clear conversation | — |
| `POST` | `/api/rag/query?mode=naive\|advanced\|agentic` | RAG query | `{"question": "..."}` |
| `GET` | `/api/search?q=...&category=...&topK=5` | Semantic search | — |
| `POST` | `/api/classify` | Classify instrument | `{"description": "..."}` |
| `POST` | `/api/extract` | Extract composer data | `{"text": "..."}` |
| `GET` | `/actuator/prometheus` | Prometheus metrics | — |
| `GET` | `/actuator/health` | Health check | — |

### document-service (:8090/8091)

| Method | Endpoint | Description | Body |
|---|---|---|---|
| `POST` | `/api/ingest` | Upload document | `multipart: file, category` |
| `GET` | `/api/documents` | List documents | — |
| `SSE` | `/mcp/sse` | MCP tool endpoint | MCP protocol |

---

## 17. Data Flow Diagrams

### Flow 1: Chat Message

```
Browser → POST /api/chat {"message": "What is jazz?", "conversationId": "abc-123"}
  → ChatController.chat()
    → ChatService.chatSync("abc-123", "What is jazz?")
      → chatClient.prompt()
        → MessageChatMemoryAdvisor: loads 20 previous messages for "abc-123" from PostgreSQL
        → Ollama API: POST /api/chat (system + history + user message)
        → Ollama generates response (streaming internally, blocking to caller)
        → MessageChatMemoryAdvisor: saves user message + response to PostgreSQL
      → returns "Jazz is a music genre that originated..."
    → returns String
  → ResponseEntity.ok({"response": "Jazz is...", "conversationId": "abc-123"})
```

### Flow 2: Naive RAG Query

```
Browser → POST /api/rag/query?mode=naive {"question": "What did Bach compose?"}
  → RagController.query()
    → NaiveRagService.query("What did Bach compose?")
      → LAYER 1: retrievalGate.retrieve("What did Bach compose?", 5)
        → vectorStore.similaritySearch(query, topK=5, threshold=0.65)
          → Ollama embed: "What did Bach compose?" → [768-dim vector]
          → PGVector: SELECT ... WHERE cosine_similarity >= 0.65 LIMIT 5
          → Returns 3 chunks from composers-biographies.pdf
        → RetrievalResult.withData(query, 3 docs)
      → LAYER 2: ragChatClient.prompt().user(question).call()
        → QuestionAnswerAdvisor:
          → Embeds question again → searches PGVector → appends context
        → Ollama: generates answer from context + question
        → Returns "Bach composed the Brandenburg Concertos, The Well-Tempered Clavier..."
      → LAYER 3: outputValidator.validate(answer, 3 chunks)
        → Grounding ratio: 0.72 (72% of content words found in chunks)
        → ValidationResult(true, "Grounding ratio: 0.72")
      → Returns answer
  → ResponseEntity.ok({"question": "...", "answer": "Bach composed...", "mode": "naive"})
```

### Flow 3: Agentic RAG with MCP

```
Browser → POST /api/rag/query?mode=agentic {"question": "Compare Bach and Mozart"}
  → AgenticRagService.query("default", "Compare Bach and Mozart")
    → agenticChatClient.prompt().user("Compare Bach and Mozart").call()
      → Ollama receives: system prompt + tool definitions + user question
      → Ollama decides: tool_call searchMusicKnowledge(query="Bach biography", topK=5, minScore=0.65)
      → Spring AI intercepts tool_call
        → MCP SSE request → document-service:8090/mcp/sse
        → MusicKnowledgeTools.searchMusicKnowledge("Bach biography", 5, 0.65)
          → PGVector search → returns formatted results
        → Tool result sent back to Ollama
      → Ollama decides: tool_call searchMusicKnowledge(query="Mozart biography", topK=5, minScore=0.65)
        → Same flow → returns Mozart results
      → Ollama generates final answer using both tool results
    → Returns comprehensive comparison
```

### Flow 4: Document Ingestion

```
Browser → POST /api/ingest (multipart: file=composers.pdf, category=composers)
  → IngestionController.ingest()
    → DocumentIngestionService.ingest(resource, "composers")
      → TikaDocumentReader.get() → parses PDF → extracts text
      → Enriches metadata: {source: "composers.pdf", category: "composers", ingested_at: 1710...}
      → TokenTextSplitter.apply() → splits into ~15 chunks at token boundaries
      → vectorStore.accept(chunks)
        → For each chunk:
          → Ollama embed: chunk_text → [768-dim vector]
          → INSERT INTO vector_store (content, metadata, embedding) VALUES (...)
        → HNSW index updated
    → IngestionResult("composers.pdf", 15, true, null)
  → ResponseEntity.ok({"filename": "composers.pdf", "chunksIngested": 15, "success": true})
```

---

## 18. Testing Strategy

### Unit Tests

Located in `mousike/src/test/java/`:

- **ChatServiceTest** — Mocks `ChatClient` and `ChatMemory`, verifies sync response and history clearing
- **NaiveRagServiceTest** — Mocks all 3 guardrail layers, verifies gate-blocked and gate-passed scenarios

### E2E Tests (Playwright)

Located in `e2e/tests/full-stack/`. 80 tests across 10 suites:

| Suite | Tests | Validates |
|---|---|---|
| 01 Infrastructure | 9 | K8s pods, PostgreSQL, Phoenix, Grafana, Prometheus, Ollama |
| 02 Document Ingestion | 7 | PDF upload, vector search, category filter, embedding metrics |
| 03 LLM Chat & Memory | 6 | Chat responses, JDBC memory, conversation isolation, UI |
| 04 RAG Pipeline | 7 | Naive/advanced/agentic modes, guardrails, context preservation |
| 05 Classification & Extraction | 6 | Instrument classify, composer extract, structured output |
| 06 MCP Integration | 5 | MCP server health, client connection, agentic tool calls |
| 07 Observability & Metrics | 12 | gen_ai metrics, PGVector, HTTP, JVM, Grafana, Phoenix |
| 08 UI Comprehensive | 12 | All Vaadin views, Grafana, Phoenix UI |
| 09 End-to-End Flow | 11 | Full pipeline: ingest → search → RAG → chat → verify metrics |
| 10 Phoenix Traces | 9 | Trace screenshots: projects, traces list, call stack details |

### Running Tests

```bash
# All E2E tests
cd e2e && npx playwright test --project=full-stack

# Single test suite
npx playwright test tests/full-stack/04-rag-pipeline.spec.ts --project=full-stack

# Unit tests
./gradlew :mousike:test
```

---

## Appendix: Key Configuration Files

### application.yml (complete)

```yaml
spring:
  application:
    name: mousike
  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/mousike}
    username: ${POSTGRES_USER:mousike}
    password: ${POSTGRES_PASSWORD:mousike-secret}
  ai:
    ollama:
      base-url: ${SPRING_AI_OLLAMA_BASE_URL:http://localhost:11434}
      chat:
        model: llama3.2
        options:
          temperature: 0.7
          top-p: 0.9
          num-ctx: 4096
      embedding:
        model: nomic-embed-text
    vectorstore:
      pgvector:
        index-type: HNSW
        distance-type: COSINE_DISTANCE
        dimensions: 768
        initialize-schema: true
    mcp:
      client:
        enabled: true
        type: SYNC
        sse:
          connections:
            document-service:
              url: ${DOCUMENT_SERVICE_URL:http://localhost:8090}/mcp/sse
    chat:
      memory:
        repository:
          jdbc:
            initialize-schema: always
      observations:
        enabled: true
        include-prompt: true
        include-completion: true
    embedding:
      observations:
        enabled: true

management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus,metrics,env
  tracing:
    sampling:
      probability: 1.0
  opentelemetry:
    tracing:
      export:
        otlp:
          endpoint: ${GRAFANA_OTLP_HTTP_URL:http://localhost:4318}/v1/traces
```

---

## 19. Troubleshooting Guide — End-to-End Debugging

This section covers real-world troubleshooting scenarios for every layer of the Mousike stack, with step-by-step diagnostic commands, expected outputs, and fixes.

---

### 19.1 Application Health & Startup Failures

#### Symptom: Pod stuck in CrashLoopBackOff or app won't start

**Step 1 — Check pod status and events:**
```bash
kubectl get pods -n rag
kubectl describe pod -l app=mousike -n rag | tail -40
```

Expected healthy output:
```
NAME                       READY   STATUS    RESTARTS   AGE
mousike-7f8d6b4c5-x2k9q   1/1     Running   0          5m
```

If `STATUS` shows `CrashLoopBackOff` or `Init:Error`:
```bash
# Check init container logs (wait-for-postgres, wait-for-redis)
kubectl logs -l app=mousike -n rag -c wait-for-postgres
kubectl logs -l app=mousike -n rag -c wait-for-redis

# Check main container logs
kubectl logs -l app=mousike -n rag --tail=100
```

**Step 2 — Check Spring Boot health endpoint:**
```bash
# Local
curl -s http://localhost:8080/actuator/health | jq .

# In-cluster via port-forward
kubectl port-forward svc/mousike-service 8080:8080 -n rag &
curl -s http://localhost:8080/actuator/health | jq .
```

Expected healthy response:
```json
{
  "status": "UP",
  "components": {
    "db": { "status": "UP", "details": { "database": "PostgreSQL" } },
    "diskSpace": { "status": "UP" },
    "ping": { "status": "UP" }
  }
}
```

**Step 3 — Common startup failures and fixes:**

| Error in Logs | Root Cause | Fix |
|---|---|---|
| `Connection refused: postgres-service:5432` | Postgres not ready | Check `kubectl rollout status statefulset/postgres -n rag` |
| `HikariPool: Connection is not available` | Wrong JDBC URL or credentials | Verify `SPRING_DATASOURCE_URL` env var and `rag-secrets` |
| `OllamaModel: Connection refused` | Ollama not running on host | Start Ollama: `ollama serve` and ensure `OLLAMA_BASE_URL` is `http://host.docker.internal:11434` |
| `NoSuchBeanDefinitionException: SyncMcpToolCallbackProvider` | document-service MCP server not reachable | Check document-service is running and `DOCUMENT_SERVICE_URL` env var |
| `Table 'vector_store' doesn't exist` | PGVector schema not initialized | Ensure `spring.ai.vectorstore.pgvector.initialize-schema: true` |

---

### 19.2 Database & PGVector Troubleshooting

#### Symptom: RAG returns "I don't have enough information" on every query

**Step 1 — Verify PostgreSQL is running and the vector_store table has data:**
```bash
# Connect to PostgreSQL
kubectl exec -it postgres-0 -n rag -- psql -U mousike -d mousike

# Inside psql:
\dt                    -- List tables
SELECT count(*) FROM vector_store;   -- Should return >0 if documents were ingested
```

Expected:
```
 count
-------
   247
```

If `count = 0`, documents were never ingested (see Section 19.5).

**Step 2 — Verify PGVector extension is loaded:**
```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

If no rows returned:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**Step 3 — Inspect vector store schema and dimensions:**
```sql
-- Check the embedding column type and dimension
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'vector_store';

-- Verify embedding dimension matches config (768 for nomic-embed-text)
SELECT vector_dims(embedding) FROM vector_store LIMIT 1;
```

Expected dimension: `768` (matches `spring.ai.vectorstore.pgvector.dimensions: 768`).

If dimension mismatch, the embedding model was changed after table creation:
```sql
-- DESTRUCTIVE: Drop and recreate (only if you can re-ingest)
DROP TABLE vector_store;
-- Restart the app — initialize-schema: true will recreate it
```

**Step 4 — Test a manual similarity search:**
```sql
-- This shows the raw data stored in PGVector
SELECT id, LEFT(content, 80) AS content_preview,
       metadata->>'source' AS source,
       metadata->>'category' AS category
FROM vector_store
LIMIT 10;
```

**Step 5 — Verify HNSW index exists:**
```sql
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'vector_store';
```

Expected: An index using `hnsw` with `vector_cosine_ops`.

---

### 19.3 Chat System Troubleshooting

#### Symptom: Chat returns empty response or hangs

**Step 1 — Test the Ollama LLM directly:**
```bash
# Verify Ollama is running and llama3.2 is available
curl -s http://localhost:11434/api/tags | jq '.models[].name'

# Direct chat test (bypass Spring AI)
curl -s http://localhost:11434/api/generate \
  -d '{"model":"llama3.2","prompt":"Hello","stream":false}' | jq .response
```

If Ollama is unreachable:
```bash
ollama serve                    # Start Ollama
ollama pull llama3.2           # Pull the model if missing
ollama pull nomic-embed-text   # Pull embedding model
```

**Step 2 — Test chat via REST API:**
```bash
curl -s -X POST http://localhost:8080/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"What is a violin?","conversationId":"debug-test"}' | jq .
```

Expected response:
```json
{
  "response": "A violin is a string instrument...",
  "conversationId": "debug-test"
}
```

**Step 3 — If chat hangs (timeout), check Ollama resource usage:**
```bash
# Check if Ollama is overloaded
curl -s http://localhost:11434/api/ps | jq .

# In application logs, look for timeout
kubectl logs -l app=mousike -n rag | grep -i "timeout\|timed out"
```

Common cause: `num-ctx: 4096` in `application.yml` may be too large for available GPU/CPU memory. Reduce to `2048` if OOM.

**Step 4 — Verify chat memory (JDBC) is working:**
```bash
# Check the chat memory table in PostgreSQL
kubectl exec -it postgres-0 -n rag -- psql -U mousike -d mousike \
  -c "SELECT conversation_id, type, LEFT(content, 60) FROM ai_chat_memory ORDER BY timestamp DESC LIMIT 10;"
```

Expected: Rows showing `USER` and `ASSISTANT` messages with your test conversation ID.

If table doesn't exist, verify `spring.ai.chat.memory.repository.jdbc.initialize-schema: always` in `application.yml`.

**Step 5 — Test streaming endpoint:**
```bash
curl -N -X POST http://localhost:8080/api/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"message":"List 3 famous composers","conversationId":"stream-debug"}'
```

Expected: Server-sent events streaming token by token. If nothing appears, the reactive pipeline is broken — check for `reactor-core` dependency.

---

### 19.4 RAG Pipeline Troubleshooting

#### Symptom: RAG always returns "I don't have enough information"

The RAG pipeline has a 3-layer guardrail system. Each layer can cause a rejection.

**Step 1 — Identify which layer is rejecting. Enable DEBUG logging:**
```bash
# Check application logs for guardrail messages
kubectl logs -l app=mousike -n rag | grep -i "retrieval\|grounding\|threshold\|no data"
```

**Step 2 — Test Layer 1 (RagRetrievalGate) directly via the search API:**
```bash
# Semantic search uses the same VectorStore as RAG
curl -s 'http://localhost:8080/api/search?q=beethoven+symphony&topK=5' | jq .
```

The `RagRetrievalGate` requires:
- **Minimum score threshold**: `0.65` — documents below this score are filtered out
- **Minimum chunk count**: `2` — at least 2 chunks must pass the threshold

```java
// RagRetrievalGate.java — the gatekeeper
private static final double MINIMUM_SCORE_THRESHOLD = 0.65;
private static final int MINIMUM_CHUNK_COUNT = 2;
```

If search returns 0 or 1 results:
- **0 results**: No documents are similar enough. Either the vector store is empty (Section 19.2) or the query is outside the knowledge domain.
- **1 result**: Only 1 chunk passed the 0.65 threshold, but the gate requires 2. The ingested documents may lack depth on this topic.

**Step 3 — Test Layer 3 (OutputValidator) grounding check:**
```java
// OutputValidator.java — grounding ratio must be ≥ 0.30
// It compares words (>4 chars) in the LLM response against retrieved chunk text
double groundingRatio = (double) groundedWords / contentWords;
if (groundingRatio < 0.3) {
    // REJECTED: LLM response diverged too far from source documents
}
```

To debug: add temporary logging to `OutputValidator.validate()`:
```java
log.debug("Grounding check: {}/{} words grounded (ratio={:.2f})",
    groundedWords, contentWords, groundingRatio);
```

**Step 4 — Compare RAG modes to isolate the issue:**
```bash
# Test all 3 RAG modes with the same question
QUESTION='{"question":"What are the major works of Bach?"}'

# Naive (topK=5, threshold=0.50)
curl -s -X POST 'http://localhost:8080/api/rag/query?mode=naive' \
  -H 'Content-Type: application/json' -d "$QUESTION" | jq .

# Advanced (topK=10, threshold=0.65, with QuestionAnswerAdvisor)
curl -s -X POST 'http://localhost:8080/api/rag/query?mode=advanced' \
  -H 'Content-Type: application/json' -d "$QUESTION" | jq .

# Agentic (MCP tool-calling, no guardrails)
curl -s -X POST 'http://localhost:8080/api/rag/query?mode=agentic' \
  -H 'Content-Type: application/json' -d "$QUESTION" | jq .
```

Interpretation:
| Naive | Advanced | Agentic | Diagnosis |
|---|---|---|---|
| Works | Fails | Works | Advanced threshold (0.65) too strict, or QuestionAnswerAdvisor misconfigured |
| Fails | Fails | Works | Vector store has data but similarity scores are low; agentic bypasses guardrails |
| Fails | Fails | Fails | No data in vector store OR Ollama is down |
| Works | Works | Fails | MCP connection to document-service is broken (Section 19.7) |

**Step 5 — Verify the Naive vs Advanced threshold difference:**
```yaml
# Naive RAG (AiConfig.java — ragChatClient)
similarityThreshold: 0.50    # Lower bar
topK: 5

# Advanced RAG (AdvancedRagService.java — inline ChatClient)
similarityThreshold: 0.65    # Higher bar
topK: 10

# RagRetrievalGate (used by both Naive and Advanced)
MINIMUM_SCORE_THRESHOLD: 0.65  # Pre-filter before LLM call
MINIMUM_CHUNK_COUNT: 2
```

Note: The Naive RAG ChatClient uses `0.50` threshold, but the `RagRetrievalGate` still uses `0.65`. So the gate may reject even when the advisor would have found results. This is by design — the gate prevents low-quality answers.

---

### 19.5 Document Ingestion Troubleshooting

#### Symptom: Documents uploaded but not appearing in search results

**Step 1 — Verify the document-service is running:**
```bash
curl -s http://localhost:8090/actuator/health | jq .
```

**Step 2 — Upload a test document and check the response:**
```bash
curl -s -X POST http://localhost:8090/api/ingest \
  -F "file=@/path/to/test-document.pdf" \
  -F "category=test" | jq .
```

Expected successful response:
```json
{
  "filename": "test-document.pdf",
  "chunksIngested": 15,
  "success": true,
  "error": ""
}
```

If `success: false`, check the `error` field. Common errors:

| Error Message | Root Cause | Fix |
|---|---|---|
| `TikaException: Unable to parse` | Unsupported file format or corrupted PDF | Test with a known-good PDF; check Apache Tika supported formats |
| `Connection refused: localhost:11434` | Ollama not reachable from document-service | Verify `SPRING_AI_OLLAMA_BASE_URL` env var |
| `Could not connect to postgres-service:5432` | Database connection failed | Check postgres pod status and credentials |
| `Max upload size exceeded` | File larger than 50MB limit | See `spring.servlet.multipart.max-file-size: 50MB` |

**Step 3 — Trace the ingestion pipeline step by step:**

The pipeline is: **File → Tika Parser → Metadata Enrichment → Token Splitter → Embedding → PGVector**

```bash
# Check document-service logs for each pipeline stage
kubectl logs -l app=document-service -n rag | grep -i "ingestion\|parsed\|chunks\|stored"
```

Expected log sequence:
```
Starting ingestion: file=music-theory.pdf category=theory
Parsed 1 documents from music-theory.pdf
Split into 42 chunks
Ingestion complete: 42 chunks stored in PGVector
```

If logs stop at "Parsed" but never reach "Split":
- The `TokenTextSplitter` failed — the document may have no extractable text (scanned PDF without OCR).

If logs stop at "Split" but never reach "Ingestion complete":
- The embedding step failed — Ollama `nomic-embed-text` model is unreachable or returned an error.

**Step 4 — Verify the bulk ingestion job ran in Kubernetes:**
```bash
kubectl get jobs -n rag
kubectl describe job document-ingester -n rag
kubectl logs job/document-ingester -n rag --tail=50
```

Expected:
```
=== Starting bulk document ingestion ===
docs/music-theory.pdf -> 42 chunks
docs/composers-biographies.pdf -> 58 chunks
docs/instruments-encyclopedia.pdf -> 73 chunks
docs/jazz-history.pdf -> 74 chunks
=== Ingestion complete: 247 total chunks stored ===
```

If the job shows `BackoffLimitExceeded`:
```bash
# The ingester retried 3 times and failed
kubectl logs job/document-ingester -n rag | grep -i "error\|failed\|exception"
```

Common failures:
- `ClassPathResource` not found: The PDF files aren't in `document-service/src/main/resources/docs/`
- `IngestionStartupRunner` not triggered: The `ingestion` profile was not activated. The job command must include `--spring.profiles.active=ingestion,k8s`

**Step 5 — Manually verify ingested data in PostgreSQL:**
```bash
kubectl exec -it postgres-0 -n rag -- psql -U mousike -d mousike

-- Count by category
SELECT metadata->>'category' AS category, count(*)
FROM vector_store
GROUP BY metadata->>'category';

-- Sample content
SELECT LEFT(content, 100), metadata->>'source', metadata->>'category'
FROM vector_store
LIMIT 5;
```

Expected:
```
 category    | count
-------------+-------
 theory      |    42
 composers   |    58
 instruments |    73
 history     |    74
```

---

### 19.6 Docling Service Troubleshooting

#### Symptom: Docling pod stuck in pending or document conversion fails

**Step 1 — Check Docling pod status:**
```bash
kubectl get pods -l app=docling -n rag
kubectl describe pod -l app=docling -n rag | tail -30
```

Docling requires significant resources (`2Gi` memory, `1` CPU minimum). On resource-constrained clusters:
```
Events:
  Warning  FailedScheduling  Insufficient memory
```

Fix: Increase Kind node resources or reduce Docling memory request.

**Step 2 — Verify Docling health endpoint:**
```bash
# Direct health check
curl -s http://localhost:5001/health
# In-cluster
kubectl exec -it $(kubectl get pod -l app=docling -n rag -o name) -n rag -- wget -qO- http://localhost:5001/health
```

**Step 3 — First boot takes 2-5 minutes** — Docling downloads ML models on startup:
```bash
kubectl logs -l app=docling -n rag --tail=30
```

Look for:
```
Downloading model: ...
Loading pipeline: ...
Ready to serve requests
```

The readiness probe is configured with generous timeouts for this reason:
```yaml
readinessProbe:
  initialDelaySeconds: 60
  periodSeconds: 15
  failureThreshold: 20    # 60s + (15s × 20) = 360s total
```

**Step 4 — Test Docling document conversion directly:**
```bash
# Docling API endpoint for PDF conversion
curl -s -X POST http://localhost:5001/v1/convert \
  -F "file=@/path/to/test.pdf" | jq '.pages | length'
```

**Step 5 — Docling cache is ephemeral:**

The deployment uses `emptyDir` for the model cache:
```yaml
volumes:
  - name: docling-cache
    mountPath: /root/.cache/docling
```

This means every pod restart re-downloads models. For production, use a `PersistentVolumeClaim` instead.

---

### 19.7 MCP (Model Context Protocol) Troubleshooting

#### Symptom: Agentic RAG fails with "Tool not found" or connection error

The MCP architecture has two sides: **Client** (mousike-app) ↔ **Server** (document-service).

**Step 1 — Verify the MCP server (document-service) is exposing the SSE endpoint:**
```bash
curl -s http://localhost:8090/mcp/sse
```

Expected: An SSE stream connection opens (may hang waiting for events — that's correct). If you get `404`, the MCP server is not configured.

Check `document-service/src/main/resources/application.yml`:
```yaml
spring.ai.mcp.server:
  enabled: true       # Must be true
  name: document-service
  version: "1.0.0"
```

**Step 2 — Verify MCP tools are registered on the server side:**

The `McpServerConfig` registers tools via `MethodToolCallbackProvider`:
```java
// document-service: McpServerConfig.java
@Bean
public ToolCallbackProvider musicKnowledgeToolProvider(MusicKnowledgeTools tools) {
    return MethodToolCallbackProvider.builder()
            .toolObjects(tools)       // Registers all @Tool methods
            .build();
}
```

The `MusicKnowledgeTools` class exposes 3 tools:
- `searchMusicKnowledge` — Full-text vector search
- `searchByCategory` — Category-filtered search
- `listAvailableDocuments` — Static document list

**Step 3 — Verify MCP client (mousike-app) connection:**

Check `mousike/src/main/resources/application.yml`:
```yaml
spring.ai.mcp.client:
  enabled: true
  type: SYNC               # Must be SYNC for SSE transport
  sse:
    connections:
      document-service:
        url: ${DOCUMENT_SERVICE_URL:http://localhost:8090}/mcp/sse
```

Common MCP client errors in logs:
```bash
kubectl logs -l app=mousike -n rag | grep -i "mcp\|tool\|callback"
```

| Error | Root Cause | Fix |
|---|---|---|
| `SyncMcpToolCallbackProvider not found` | MCP client failed to initialize | Check `DOCUMENT_SERVICE_URL` env var points to running document-service |
| `Connection refused: document-service:8090` | document-service pod not ready | `kubectl rollout status deployment/document-service -n rag` |
| `Tool 'searchMusicKnowledge' not found` | MCP SSE handshake failed | Restart both pods; check network policies |
| `Read timed out (30s)` | Tool call took too long | Increase `request-timeout: 30s` in MCP client config |

**Step 4 — Test agentic RAG end-to-end:**
```bash
curl -s -X POST 'http://localhost:8080/api/rag/query?mode=agentic' \
  -H 'Content-Type: application/json' \
  -d '{"question":"What instruments did Bach compose for?"}' | jq .
```

**Step 5 — Verify the agenticChatClient has MCP tools registered:**

In application logs during startup, look for:
```
Registering MCP tool callbacks: [searchMusicKnowledge, searchByCategory, listAvailableDocuments]
```

The `McpClientConfig` wires the `SyncMcpToolCallbackProvider` into the agentic ChatClient:
```java
// McpClientConfig.java — mousike-app
@Bean("agenticChatClient")
public ChatClient agenticChatClient(ChatModel chatModel, ChatMemory chatMemory,
        SyncMcpToolCallbackProvider mcpToolCallbackProvider) {
    return ChatClient.builder(chatModel)
            .defaultToolCallbacks(mcpToolCallbackProvider)  // MCP tools
            .build();
}
```

---

### 19.8 Tracing & Observability Troubleshooting

#### Symptom: Phoenix shows 0 traces / Grafana Tempo has no traces

This is the most common issue in the stack. Spring Boot 4 changed the tracing auto-configuration significantly.

**Step 1 — Verify the critical dependency is present:**
```kotlin
// build.gradle.kts — THIS IS THE FIX for most tracing issues
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-opentelemetry")  // REQUIRED
    implementation("io.micrometer:micrometer-tracing-bridge-otel")
    implementation("io.opentelemetry:opentelemetry-exporter-otlp")
}
```

In Spring Boot 4, `spring-boot-starter-opentelemetry` is **required** for tracing auto-configuration. Without it:
- `SdkTracerProvider` bean is never created
- `OtelTracer` bean is never created
- `TracingObservationHandler` bean is never created
- Metrics still work (Prometheus is pull-based), but traces don't (OTLP is push-based)

**Step 2 — Verify tracing beans exist at runtime:**
```bash
# Check for tracing auto-configuration
curl -s http://localhost:8080/actuator/conditions | jq '.contexts.application.positiveMatches | keys[]' | grep -i "trac\|otel\|opentelemetry"
```

Expected (healthy):
```
"OpenTelemetryAutoConfiguration"
"OpenTelemetryTracingAutoConfiguration"
"MicrometerTracingAutoConfiguration"
```

If NONE of these appear in positive matches, the `spring-boot-starter-opentelemetry` dependency is missing.

**Step 3 — Verify SpanExporter beans are registered:**
```bash
curl -s http://localhost:8080/actuator/beans | jq '.contexts.application.beans | to_entries[] | select(.key | test("spanExporter|SpanExporter")) | .key'
```

Expected:
```
"phoenixSpanExporter"
"grafanaSpanExporter"
```

These are defined in `ObservabilityConfig.java`:
```java
@Bean
public SpanExporter phoenixSpanExporter() {
    return OtlpHttpSpanExporter.builder()
            .setEndpoint(phoenixOtlpUrl + "/v1/traces")    // http://phoenix-service:6006/v1/traces
            .setTimeout(Duration.ofSeconds(10))
            .build();
}

@Bean
public SpanExporter grafanaSpanExporter() {
    return OtlpHttpSpanExporter.builder()
            .setEndpoint(grafanaOtlpUrl + "/v1/traces")    // http://grafana-lgtm-service:4318/v1/traces
            .setTimeout(Duration.ofSeconds(10))
            .build();
}
```

**Step 4 — Verify OTLP endpoint connectivity:**
```bash
# Test Phoenix OTLP endpoint
curl -s -o /dev/null -w "%{http_code}" http://localhost:6006/v1/traces

# Test Grafana Tempo OTLP endpoint
curl -s -o /dev/null -w "%{http_code}" http://localhost:4318/v1/traces
```

Expected: `200` or `405` (Method Not Allowed for GET — that's OK, it expects POST).
If `000` or connection refused: the target service is down.

**Step 5 — Verify sampling probability is 1.0:**
```yaml
# application.yml — must be 1.0 to capture all traces
management:
  tracing:
    sampling:
      probability: 1.0    # 0.0 = no traces, 1.0 = all traces
```

If set to `0.1`, only 10% of traces are captured — you may not see your test requests.

**Step 6 — Spring Boot 4 property namespace change:**
```yaml
# OLD (Spring Boot 3.x) — DOES NOT WORK in Spring Boot 4
management:
  otlp:
    tracing:
      endpoint: http://localhost:4318/v1/traces

# NEW (Spring Boot 4.x) — CORRECT
management:
  opentelemetry:
    tracing:
      export:
        otlp:
          endpoint: http://localhost:4318/v1/traces
```

**Step 7 — Generate a trace and verify it appears:**
```bash
# Generate a trace
curl -s -X POST http://localhost:8080/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Hello","conversationId":"trace-test"}'

# Wait 5 seconds for export
sleep 5

# Check Phoenix for spans
curl -s 'http://localhost:6006/v1/projects/default/spans?limit=10' | jq '.data | length'
```

Expected: At least 1-3 spans (HTTP server span, chat model span, etc.).

**Step 8 — Check for observation-specific configuration:**
```yaml
# These must be true to see AI-specific spans
spring.ai.chat.observations.enabled: true
spring.ai.chat.observations.include-prompt: true      # See prompt text in spans
spring.ai.chat.observations.include-completion: true   # See LLM response in spans
spring.ai.embedding.observations.enabled: true
spring.ai.vectorstore.observations.enabled: true
```

**Step 9 — Verify traceId appears in application logs:**
```bash
kubectl logs -l app=mousike -n rag | grep "traceId="
```

Expected log format (from `application.yml` logging pattern):
```
14:23:45.678 [http-nio-8080-exec-1] DEBUG c.e.m.chat.ChatService - traceId=abc123def456 spanId=789xyz - Processing chat
```

If `traceId=` is always empty, the `TracingObservationHandler` is not active.

---

### 19.9 Prometheus Metrics Troubleshooting

#### Symptom: Grafana dashboards show no metrics

**Step 1 — Verify the Prometheus metrics endpoint:**
```bash
curl -s http://localhost:8080/actuator/prometheus | head -20
```

Expected: Prometheus text format metrics:
```
# HELP jvm_memory_used_bytes Used JVM memory
# TYPE jvm_memory_used_bytes gauge
jvm_memory_used_bytes{area="heap",id="G1 Eden Space"} 4.2E7
```

**Step 2 — Check for Spring AI-specific metrics:**
```bash
curl -s http://localhost:8080/actuator/prometheus | grep -i "spring_ai\|chat\|embedding"
```

Expected metrics:
```
spring_ai_chat_client_duration_seconds_count{...}
spring_ai_chat_client_duration_seconds_sum{...}
spring_ai_embedding_duration_seconds_count{...}
```

**Step 3 — Verify Prometheus scrape annotations on the pod:**
```yaml
# k8s/mousike/deployment.yaml — these annotations tell Prometheus to scrape
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8080"
  prometheus.io/path: "/actuator/prometheus"
```

**Step 4 — Check Grafana LGTM's Prometheus is scraping:**
```bash
# Access Prometheus UI
curl -s 'http://localhost:9090/api/v1/targets' | jq '.data.activeTargets[] | {scrapeUrl, health}'
```

---

### 19.10 Semantic Search Troubleshooting

#### Symptom: Search returns empty results or irrelevant matches

**Step 1 — Test search API directly:**
```bash
# Basic search
curl -s 'http://localhost:8080/api/search?q=violin+concerto&topK=5' | jq .

# Search with category filter
curl -s 'http://localhost:8080/api/search?q=violin&category=instruments&topK=5' | jq .
```

**Step 2 — If search returns empty but vector_store has data:**

The `SemanticSearchService` uses a similarity threshold of `0.6`:
```java
// SemanticSearchService.java
var requestBuilder = SearchRequest.builder()
        .query(query)
        .topK(topK > 0 ? topK : 5)
        .similarityThreshold(0.6);    // Minimum cosine similarity
```

Test with a broader query that matches ingested content more closely.

**Step 3 — If category filter returns empty but unfiltered search works:**

The filter expression uses PGVector metadata JSON filtering:
```java
var filter = new FilterExpressionBuilder().eq("category", category).build();
```

Verify the category metadata was set during ingestion:
```sql
SELECT DISTINCT metadata->>'category' FROM vector_store;
```

Expected categories: `theory`, `composers`, `instruments`, `history` (set by `IngestionStartupRunner`).

**Step 4 — If results are irrelevant (low quality):**

The embedding model quality matters. `nomic-embed-text` produces 768-dim embeddings. If you switched models, the existing embeddings in PGVector are incompatible.

```bash
# Verify which embedding model Ollama is using
curl -s http://localhost:11434/api/tags | jq '.models[] | select(.name | test("nomic"))'
```

---

### 19.11 Kubernetes Cluster Troubleshooting

#### Symptom: Cluster won't start or pods are not schedulable

**Step 1 — Verify Kind cluster is running:**
```bash
kind get clusters
docker ps | grep kind
kubectl cluster-info --context kind-mousike-cluster
```

**Step 2 — Check all pods in the rag namespace:**
```bash
kubectl get all -n rag
```

Expected (all 7 pods + 1 job):
```
NAME                                READY   STATUS      RESTARTS   AGE
pod/postgres-0                      1/1     Running     0          10m
pod/redis-xxx                       1/1     Running     0          10m
pod/docling-xxx                     1/1     Running     0          10m
pod/phoenix-xxx                     1/1     Running     0          10m
pod/grafana-lgtm-xxx                1/1     Running     0          10m
pod/document-service-xxx            1/1     Running     0          10m
pod/mousike-xxx                     1/1     Running     0          10m
pod/document-ingester-xxx           0/1     Completed   0          10m
```

**Step 3 — Common Kind cluster issues:**

| Symptom | Root Cause | Fix |
|---|---|---|
| `imagePullPolicy: Never` + `ErrImageNeverPull` | Image not loaded into Kind | `kind load docker-image mousike-app:latest --name mousike-cluster` |
| Port-forward not working | NodePort not mapped in kind-config.yaml | Check `k8s/kind-config.yaml` extraPortMappings |
| `host.docker.internal` not resolving | Kind doesn't support it on Linux | Use `docker network inspect kind` to find host IP |
| Postgres PVC stuck in Pending | No default StorageClass | `kubectl get sc` — Kind provides `standard` by default |

**Step 4 — Rebuild and redeploy a single service:**
```bash
# Rebuild mousike-app
./gradlew :mousike:bootBuildImage --imageName=mousike-app:latest

# Load into Kind
kind load docker-image mousike-app:latest --name mousike-cluster

# Restart the deployment
kubectl rollout restart deployment/mousike -n rag
kubectl rollout status deployment/mousike -n rag --timeout=120s
```

**Step 5 — Full cluster reset (nuclear option):**
```bash
kind delete cluster --name mousike-cluster
./scripts/cluster-up.sh
```

**Step 6 — Check inter-service connectivity:**
```bash
# From mousike pod, verify it can reach all services
kubectl exec -it $(kubectl get pod -l app=mousike -n rag -o jsonpath='{.items[0].metadata.name}') -n rag -- sh -c '
  wget -qO- http://postgres-service:5432 2>&1 | head -1
  wget -qO- http://document-service:8090/actuator/health 2>&1 | head -1
  wget -qO- http://phoenix-service:6006/healthz 2>&1 | head -1
  wget -qO- http://grafana-lgtm-service:4318/v1/traces 2>&1 | head -1
'
```

---

### 19.12 E2E Test Troubleshooting

#### Symptom: Playwright tests fail with timeouts or assertion errors

**Step 1 — Verify all services are reachable before running tests:**
```bash
# Tests expect these endpoints
curl -s http://localhost:8080/actuator/health | jq .status   # mousike
curl -s http://localhost:8090/actuator/health | jq .status   # document-service
curl -s http://localhost:6006/healthz                          # phoenix
curl -s http://localhost:3000/api/health | jq .status         # grafana
curl -s http://localhost:11434/api/tags | jq '.models | length'  # ollama
```

**Step 2 — Run a single test file for debugging:**
```bash
cd e2e
npx playwright test tests/full-stack/01-infrastructure.spec.ts --reporter=line
```

**Step 3 — Common E2E test failures:**

| Test File | Common Failure | Root Cause | Fix |
|---|---|---|---|
| `01-infrastructure` | `Connection refused :8080` | mousike pod not ready | Wait for readiness probe |
| `02-llm-chat` | `Timeout 30s` | Ollama slow on first inference | Increase test timeout or warm up Ollama |
| `03-embedding` | `Expected >0, got 0` | nomic-embed-text not pulled | `ollama pull nomic-embed-text` |
| `05-rag-query` | `"I don't have enough information"` | Vector store empty | Run document ingestion first |
| `07-mcp` | `MCP tool failed` | document-service MCP endpoint down | Check port 8090 |
| `08-observability` | `Metric not found` | Metrics not yet scraped | Retry — timing issue |
| `10-phoenix-screenshots` | `Locator timeout` | Phoenix UI changed selectors | Update test locators |

**Step 4 — Debug with headed browser:**
```bash
cd e2e
npx playwright test tests/full-stack/10-phoenix-trace-screenshots.spec.ts --headed --timeout=120000
```

**Step 5 — Phoenix screenshot test specifics:**

The Phoenix UI uses React with dynamic rendering. Common gotchas:
```typescript
// Modal overlay intercepts clicks on spans
// Fix: dismiss with Escape, use force: true
const overlay = page.locator('[data-testid="modal-overlay"]');
if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
}
await chatSpan.click({ force: true });

// Phoenix uses base64 project IDs, NOT string names in URLs
// WRONG: /projects/default  → "Incorrect padding" error
// RIGHT: Navigate via UI clicks
await page.locator('text=default').first().click();
```

**Step 6 — Run full E2E suite:**
```bash
cd e2e
npx playwright test --reporter=line
```

Expected: `80 passed` (all 80 tests across 10 test files).

---

### 19.13 Build & Dependency Troubleshooting

#### Symptom: Gradle build fails or dependency resolution errors

**Step 1 — Check Gradle build:**
```bash
./gradlew :mousike:build --info 2>&1 | tail -20
./gradlew :document-service:build --info 2>&1 | tail -20
```

**Step 2 — Spring AI BOM version mismatch:**

The project uses Spring AI 2.0.0-M2 (milestone release). This requires the Spring Milestones repository:
```kotlin
// settings.gradle.kts or build.gradle.kts
repositories {
    mavenCentral()
    maven { url = uri("https://repo.spring.io/milestone") }
}
```

If you see `Could not find spring-ai-starter-model-ollama:2.0.0-M2`:
- The milestone repository is missing from your Gradle config.

**Step 3 — Verify dependency tree for tracing:**
```bash
./gradlew :mousike:dependencies --configuration runtimeClasspath | grep -i "otel\|tracing\|micrometer"
```

Expected:
```
+--- org.springframework.boot:spring-boot-starter-opentelemetry
|    +--- io.opentelemetry:opentelemetry-sdk
|    +--- io.micrometer:micrometer-tracing
+--- io.micrometer:micrometer-tracing-bridge-otel
+--- io.opentelemetry:opentelemetry-exporter-otlp
+--- io.micrometer:micrometer-registry-prometheus
```

If `spring-boot-starter-opentelemetry` is missing from the tree, add it to `build.gradle.kts`.

**Step 4 — Docker image build issues:**
```bash
# Spring Boot's built-in buildpack (no Dockerfile needed)
./gradlew :mousike:bootBuildImage --imageName=mousike-app:latest

# If buildpack fails, check Docker daemon is running
docker info
```

Common buildpack errors:
- `Cannot connect to the Docker daemon`: Start Docker Desktop
- `Insufficient memory for buildpack`: Increase Docker memory to ≥4GB
- `Builder image pull failed`: Check internet connectivity

---

### 19.14 Troubleshooting Decision Tree

Use this flowchart to quickly identify which section to read:

```
Start: What's broken?
│
├─ App won't start → 19.1 (Health & Startup)
│
├─ Chat returns nothing → 19.3 (Chat System)
│  └─ Is Ollama running? → ollama serve && ollama pull llama3.2
│
├─ RAG always says "I don't have enough information"
│  ├─ Search returns 0 results → 19.2 (Database) — is vector_store empty?
│  │  └─ Yes → 19.5 (Document Ingestion) — did ingestion run?
│  │     └─ No → Run ingestion job or upload docs via API
│  ├─ Search returns results but RAG rejects
│  │  └─ 19.4 (RAG Pipeline) — which guardrail layer is rejecting?
│  └─ Agentic RAG fails but Naive works
│     └─ 19.7 (MCP) — document-service connection issue
│
├─ Phoenix shows 0 traces → 19.8 (Tracing)
│  └─ Missing spring-boot-starter-opentelemetry? → Add dependency
│
├─ Grafana shows no metrics → 19.9 (Prometheus Metrics)
│
├─ Search returns wrong results → 19.10 (Semantic Search)
│
├─ K8s pods not running → 19.11 (Kubernetes)
│
├─ E2E tests failing → 19.12 (E2E Tests)
│
├─ Build fails → 19.13 (Build & Dependencies)
│
└─ Docling not ready → 19.6 (Docling) — wait 2-5 min for ML model download
```

---

### 19.15 Quick Health Check Script

Run this script to verify the entire stack in one go:

```bash
#!/bin/bash
echo "=== Mousike Stack Health Check ==="

check() {
  local name=$1 url=$2 expected=$3
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null)
  if [ "$status" = "$expected" ]; then
    echo "  ✓ $name ($url) — HTTP $status"
  else
    echo "  ✗ $name ($url) — HTTP $status (expected $expected)"
  fi
}

echo ""
echo "--- Services ---"
check "Mousike App"       "http://localhost:8080/actuator/health" "200"
check "Document Service"  "http://localhost:8090/actuator/health" "200"
check "Ollama"            "http://localhost:11434/api/tags"       "200"
check "Phoenix"           "http://localhost:6006/healthz"         "200"
check "Grafana"           "http://localhost:3000/api/health"      "200"

echo ""
echo "--- Observability ---"
check "Prometheus metrics" "http://localhost:8080/actuator/prometheus" "200"
check "Phoenix OTLP"      "http://localhost:6006/v1/traces"          "200"
check "Grafana OTLP"      "http://localhost:4318/v1/traces"          "405"

echo ""
echo "--- Database ---"
count=$(kubectl exec -it postgres-0 -n rag -- psql -U mousike -d mousike -t -c "SELECT count(*) FROM vector_store;" 2>/dev/null | tr -d ' ')
if [ -n "$count" ] && [ "$count" -gt 0 ]; then
  echo "  ✓ PGVector vector_store — $count documents"
else
  echo "  ✗ PGVector vector_store — empty or unreachable"
fi

echo ""
echo "--- LLM Models ---"
models=$(curl -s http://localhost:11434/api/tags 2>/dev/null | python3 -c "import sys,json; [print(f'  ✓ {m[\"name\"]}') for m in json.load(sys.stdin).get('models',[])]" 2>/dev/null)
if [ -n "$models" ]; then
  echo "$models"
else
  echo "  ✗ Ollama unreachable or no models"
fi

echo ""
echo "=== Health Check Complete ==="
```
