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
