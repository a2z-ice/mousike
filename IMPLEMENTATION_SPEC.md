# IMPLEMENTATION SPEC: Modular RAG + Concerto for Java & AI
## Local Kind Cluster · Spring Boot 3.4 · Spring AI 1.x · Local Ollama (Host) · No Arconia

---

> **FOR CLAUDE AGENT:** This is a complete, self-contained implementation specification.
> Read every section before generating any code. All decisions are pre-made.
> Do not invent alternatives. Follow the exact patterns, class names, and YAML structures specified.
> Where you see `[IMPLEMENT]` you must generate complete, production-ready code.
> Where you see `[DEPLOY]` you must generate complete Kubernetes YAML.

---

## TABLE OF CONTENTS

1. [Project Identity & Hard Constraints](#1-project-identity--hard-constraints)
2. [What Arconia Did (Reference Only — NOT Used)](#2-what-arconia-did-reference-only--not-used)
3. [MCP Architecture (from Diagram)](#3-mcp-architecture-from-diagram)
4. [Full System Architecture](#4-full-system-architecture)
5. [Repository Source Analysis](#5-repository-source-analysis)
6. [Kind Cluster Setup](#6-kind-cluster-setup)
7. [Kubernetes Manifests — All Components](#7-kubernetes-manifests--all-components)
8. [Gradle Build File](#8-gradle-build-file)
9. [Application Configuration (application.yml)](#9-application-configuration-applicationyml)
10. [Spring Boot Code — All Features](#10-spring-boot-code--all-features)
11. [MCP Server Implementation](#11-mcp-server-implementation)
12. [MCP Client Integration](#12-mcp-client-integration)
13. [Modular RAG Patterns](#13-modular-rag-patterns)
14. [Document Ingestion Pipeline](#14-document-ingestion-pipeline)
15. [Observability — Phoenix + Grafana (No Arconia)](#15-observability--phoenix--grafana-no-arconia)
16. [Vaadin UI](#16-vaadin-ui)
17. [Testing Strategy](#17-testing-strategy)
18. [Deployment Runbook](#18-deployment-runbook)
19. [Ollama Host Setup](#19-ollama-host-setup)
20. [File Tree — Complete Project Structure](#20-file-tree--complete-project-structure)

---

## 1. Project Identity & Hard Constraints

### Project Name
`mousike` (Greek for "music") — a composer assistant application

### Hard Constraints — Claude MUST Follow These Exactly

| Constraint | Value |
|---|---|
| **NO Arconia** | Zero `io.arconia` dependencies anywhere |
| **NO Arconia CLI** | Use `./gradlew bootRun` / `bootBuildImage` only |
| **NO Testcontainers at runtime** | No `bootTestRun` — all services are in Kind cluster |
| **NO Docker Ollama** | Ollama runs on HOST machine only |
| **Spring Boot version** | `3.4.5` |
| **Spring AI version** | `1.0.0` (GA) |
| **Java version** | `21` (LTS) |
| **Build tool** | Gradle Kotlin DSL (`build.gradle.kts`) |
| **Kubernetes** | Kind (local) |
| **LLM Inference** | Ollama on HOST at `localhost:11434` |
| **Vector Store** | PostgreSQL + pgvector extension |
| **Document Parser** | Docling Serve (in Kind cluster) |
| **Observability** | Phoenix (Arize) + Grafana LGTM (both in Kind) |
| **Chat Memory** | Redis (in Kind cluster) |
| **UI** | Vaadin 24.x (included in Spring Boot jar) |

### What Arconia Was — Never Use It
Arconia is a Spring Boot add-on framework by ThomasVitale that provided:
- **Dev Services**: Auto-starting containers (PostgreSQL, Docling, Phoenix, Grafana, Redis, Ollama) via Testcontainers when running `bootTestRun`
- **Arconia OpenTelemetry**: Single dependency for OTel + Micrometer bridging
- **Arconia Docling**: Java SDK + Spring Boot autoconfigure for Docling Serve
- **Arconia CLI**: Wrapper for `bootTestRun` with env injection

**We replace ALL of the above** with:
- Kubernetes Deployments/StatefulSets in Kind → services are always running
- Manual Spring Boot `application.yml` OTel configuration
- Spring AI's built-in `DoclingDocumentReader` (no Arconia client needed)
- Standard `./gradlew bootRun` with env vars from Kubernetes ConfigMap

---

## 2. What Arconia Did (Reference Only — NOT Used)

This table exists so Claude understands the source repos without being confused by Arconia imports.

| Arconia Feature | Original Dependency | Our Replacement |
|---|---|---|
| `arconia-dev-services-postgres` | Auto-start PostgreSQL container | `ankane/pgvector` StatefulSet in Kind |
| `arconia-dev-services-lgtm` | Auto-start Grafana LGTM | `grafana/otel-lgtm` Deployment in Kind |
| `arconia-dev-services-phoenix` | Auto-start Phoenix container | `arizephoenix/phoenix` Deployment in Kind |
| `arconia-dev-services-redis` | Auto-start Redis container | `redis:7-alpine` Deployment in Kind |
| `arconia-dev-services-docling` | Auto-start Docling Serve container | `quay.io/docling-project/docling-serve` Deployment in Kind |
| `arconia-dev-services-ollama` | Start Ollama container if not native | Native Ollama on HOST, `OLLAMA_HOST=0.0.0.0` |
| `arconia-opentelemetry-spring-boot-starter` | Unified OTel + Micrometer | `micrometer-tracing-bridge-otel` + `opentelemetry-exporter-otlp` + manual config |
| `arconia-docling` | Docling Java SDK + Spring autoconfigure | Spring AI `spring-ai-docling-document-reader` |
| `arconia dev` CLI command | `bootTestRun` wrapper | Standard `bootRun` / `bootBuildImage` |

---

## 3. MCP Architecture (from Diagram)

### Diagram Description
The MCP architecture from Thomas Vitale's slide (concerto-for-java-and-ai, Devoxx UK 2025) shows:

```
                    ┌─────────────────────────────────┐
                    │         MCP Server               │
                    │   ┌──────────────────────┐       │
                    │   │         API          │       │
                    │   └──────────┬───────────┘       │
                    └─────────────┼───────────────────-┘
                                  │ Tool Call
                                  │ (orange ↕)
  Question ──────►  ┌─────────────┼────────────────────────────┐
                    │    ┌────────▼────────┐                    │
                    │    │   MCP Client    │◄──── Tool Call     │
                    │    │                 │      Request        │
                    │    │                 │ ──── Tool Call ──►  │   ┌─────────────────┐
                    │    └─────────────────┘      Response       │   │   Inference     │
                    │                              ◄─────────────┼───│    Service      │
                    │                      Request ──────────────┼──►│   (Ollama)      │
                    │                      Response ◄────────────┼───│                 │
                    └────────────────────────────────────────────┘   └─────────────────┘
  Answer   ◄──────         Application
```

### Exact Interaction Flow (6 Steps)

```
Step 1:  User sends Question → Application REST endpoint or Vaadin UI
Step 2:  Application (MCP Client) sends Request → Ollama Inference Service
         Request = {messages: [...], tools: [tool_descriptor_list]}
Step 3:  Ollama returns Tool Call Request → MCP Client
         Ollama decides WHICH tool to call and with WHAT arguments
Step 4:  MCP Client executes Tool Call → MCP Server API
         MCP Client calls the tool method defined in MCP Server
Step 5:  MCP Server API executes the business logic, returns Tool Call Response
Step 6:  MCP Client sends Tool Call Response back to Ollama
         Ollama uses the result to generate the final Response → Answer
```

### Key Architectural Insight
- The **MCP Server** is a SEPARATE Spring Boot application that exposes tools via HTTP+SSE
- The **Application** embeds an **MCP Client** (Spring AI `McpSyncClient` or `McpAsyncClient`)
- The **Inference Service** (Ollama) is the orchestrator — it DECIDES when to call tools
- The MCP Client is the bridge: it tells Ollama what tools exist, then executes them when Ollama asks

### Two Valid Deployment Modes

**Mode A: Separate Services (Production-style — IMPLEMENT THIS)**
```
mousike-app (Application + MCP Client) ← → document-service (MCP Server) ← → Ollama
```

**Mode B: Same Process (for simple tools)**
```
mousike-app (Application + MCP Client + MCP Server in same JVM) ← → Ollama
```

**Use Mode A.** The `document-service` runs as a separate Pod in Kind and exposes tools via HTTP+SSE MCP transport.

---

## 4. Full System Architecture

### Component Registry

| Component | Docker Image | K8s Kind | Namespace Port | Host Port |
|---|---|---|---|---|
| `mousike-app` | `mousike-app:latest` (custom) | Deployment | ClusterIP 8080 | NodePort 30080 |
| `document-service` | `document-service:latest` (custom) | Deployment | ClusterIP 8090 | NodePort 30090 |
| `postgres` | `ankane/pgvector:latest` | StatefulSet | ClusterIP 5432 | — |
| `docling` | `quay.io/docling-project/docling-serve:latest` | Deployment | ClusterIP 5001 | — |
| `redis` | `redis:7-alpine` | Deployment | ClusterIP 6379 | — |
| `phoenix` | `arizephoenix/phoenix:latest` | Deployment | ClusterIP 6006/4317 | NodePort 30600 |
| `grafana-lgtm` | `grafana/otel-lgtm:latest` | Deployment | ClusterIP 3000/4318 | NodePort 30300/30418 |
| `ollama` | **NOT IN CLUSTER** | — | HOST 11434 | 11434 |

### Network Topology

```
YOUR HOST MACHINE
├── Ollama (port 11434, bound to 0.0.0.0)
│   ├── Models: llama3.2, nomic-embed-text
│   └── Accessible from Kind pods via: http://host.docker.internal:11434
│
└── Kind Cluster (namespace: rag)
    ├── mousike-app:30080          → http://localhost:8080  (Vaadin UI + REST API)
    ├── document-service:30090     → http://localhost:8090  (MCP Server API)
    ├── phoenix:30600              → http://localhost:6006  (LLM Traces UI)
    ├── grafana-lgtm:30300         → http://localhost:3000  (Metrics/Logs UI)
    ├── grafana-lgtm:30418         → OTLP HTTP receiver (internal)
    └── Internal services (ClusterIP only):
        ├── postgres-service:5432
        ├── docling-service:5001
        └── redis-service:6379
```

### ConfigMap Values (k8s/configmap.yaml)

```yaml
# Every Spring Boot property that varies by environment is driven from this ConfigMap
OLLAMA_BASE_URL:          "http://host.docker.internal:11434"
POSTGRES_HOST:            "postgres-service"
POSTGRES_PORT:            "5432"
POSTGRES_DB:              "mousike"
DOCLING_BASE_URL:         "http://docling-service:5001"
PHOENIX_OTLP_GRPC_URL:   "http://phoenix-service:4317"
GRAFANA_OTLP_HTTP_URL:   "http://grafana-lgtm-service:4318"
REDIS_HOST:               "redis-service"
REDIS_PORT:               "6379"
DOCUMENT_SERVICE_URL:     "http://document-service:8090"
SPRING_PROFILES_ACTIVE:   "k8s"
```

---

## 5. Repository Source Analysis

### ThomasVitale/concerto-for-java-and-ai — Branch Map

Each branch represents a conference where new features were added. **Implement ALL features from ALL branches.**

| Branch | Conference | Features Added |
|---|---|---|
| `main` | Spring I/O 2024 | Text classification, structured extraction, semantic search, Vaadin UI, basic RAG, Grafana LGTM observability |
| `devoxx-uk-2025` | Devoxx UK 2025 | MCP integration (client + server), tool calling, document service as MCP Server |
| `javaone-2025` | JavaOne 2025 | Agentic RAG, multi-turn chat memory (Redis), advanced prompt engineering |
| `yow-australia-2024` | YOW Australia 2024 | Phoenix observability for LLM tracing, evaluation patterns |
| `goto-copenhagen-2024` | GOTO Copenhagen 2024 | Input/output guardrails, OWASP LLM Top 10 mitigations |

### ThomasVitale/modular-rag — Pattern Map

| Module | RAG Pattern | Spring AI API Used |
|---|---|---|
| `naive-rag` | Direct embed → retrieve → generate | `RetrievalAugmentationAdvisor` (no transformers) |
| `advanced-rag` | Query rewrite + re-rank | `RewriteQueryTransformer`, `TranslationQueryTransformer`, `ScoreDocumentPostProcessor` |
| `agentic-rag` | LLM-driven tool retrieval | `@Tool` annotated methods, `ChatClient.tools()` |
| `hybrid-rag` | Keyword + semantic search | `VectorStore.similaritySearch()` + PostgreSQL FTS combined |

### Arconia (arconia-io/arconia) — Reference Understanding

Arconia has three relevant modules we analyze but **DO NOT use**:
- `arconia-dev-services/` → Testcontainers wrappers for each service
- `arconia-observability/arconia-opentelemetry/` → OTel SDK setup + Micrometer bridge
- `arconia-ai/arconia-docling/` → Docling Serve HTTP client + Spring autoconfigure

Understanding these helps us know what Spring configuration is needed without Arconia's autoconfigure.

---

## 6. Kind Cluster Setup

### [DEPLOY] kind-config.yaml

```yaml
# FILE: k8s/kind-config.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: mousike-cluster
nodes:
  - role: control-plane
    extraPortMappings:
      - containerPort: 30080   # mousike-app
        hostPort: 8080
        protocol: TCP
      - containerPort: 30090   # document-service (MCP Server)
        hostPort: 8090
        protocol: TCP
      - containerPort: 30300   # Grafana UI
        hostPort: 3000
        protocol: TCP
      - containerPort: 30418   # Grafana OTLP HTTP
        hostPort: 4318
        protocol: TCP
      - containerPort: 30600   # Phoenix UI + OTLP
        hostPort: 6006
        protocol: TCP
  - role: worker
    labels:
      workload: app
  - role: worker
    labels:
      workload: data
```

### Cluster Bootstrap Script

```bash
# FILE: scripts/cluster-up.sh
#!/bin/bash
set -euo pipefail

echo "==> Creating Kind cluster..."
kind create cluster --config k8s/kind-config.yaml

echo "==> Creating namespace..."
kubectl create namespace rag
kubectl config set-context --current --namespace=rag

echo "==> Applying ConfigMap and Secrets..."
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml

echo "==> Deploying infrastructure services..."
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/redis/
kubectl apply -f k8s/docling/
kubectl apply -f k8s/phoenix/
kubectl apply -f k8s/grafana/

echo "==> Waiting for infrastructure to be ready..."
kubectl rollout status statefulset/postgres --timeout=120s
kubectl rollout status deployment/docling --timeout=180s
kubectl rollout status deployment/redis --timeout=60s
kubectl rollout status deployment/phoenix --timeout=60s
kubectl rollout status deployment/grafana-lgtm --timeout=60s

echo "==> Building and loading application images..."
./gradlew :mousike:bootBuildImage --imageName=mousike-app:latest
./gradlew :document-service:bootBuildImage --imageName=document-service:latest
kind load docker-image mousike-app:latest --name mousike-cluster
kind load docker-image document-service:latest --name mousike-cluster

echo "==> Deploying applications..."
kubectl apply -f k8s/document-service/
kubectl apply -f k8s/mousike/

echo "==> Running document ingestion job..."
kubectl apply -f k8s/ingester/job.yaml
kubectl wait --for=condition=complete job/document-ingester --timeout=300s

echo "==> Cluster ready!"
echo "   Mousike App:       http://localhost:8080"
echo "   Document Service:  http://localhost:8090"
echo "   Phoenix:           http://localhost:6006"
echo "   Grafana:           http://localhost:3000"
```

---

## 7. Kubernetes Manifests — All Components

### [DEPLOY] k8s/configmap.yaml

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: rag-config
  namespace: rag
data:
  OLLAMA_BASE_URL: "http://host.docker.internal:11434"
  POSTGRES_HOST: "postgres-service"
  POSTGRES_PORT: "5432"
  POSTGRES_DB: "mousike"
  DOCLING_BASE_URL: "http://docling-service:5001"
  PHOENIX_OTLP_GRPC_URL: "http://phoenix-service:4317"
  GRAFANA_OTLP_HTTP_URL: "http://grafana-lgtm-service:4318"
  REDIS_HOST: "redis-service"
  REDIS_PORT: "6379"
  DOCUMENT_SERVICE_URL: "http://document-service:8090"
  SPRING_PROFILES_ACTIVE: "k8s"
```

### [DEPLOY] k8s/secrets.yaml

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: rag-secrets
  namespace: rag
type: Opaque
stringData:
  POSTGRES_USER: "mousike"
  POSTGRES_PASSWORD: "mousike-secret"
```

### [DEPLOY] k8s/postgres/statefulset.yaml

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: rag
spec:
  serviceName: postgres-service
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: ankane/pgvector:latest
          env:
            - name: POSTGRES_DB
              valueFrom:
                configMapKeyRef:
                  name: rag-config
                  key: POSTGRES_DB
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: rag-secrets
                  key: POSTGRES_USER
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: rag-secrets
                  key: POSTGRES_PASSWORD
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "mousike", "-d", "mousike"]
            initialDelaySeconds: 15
            periodSeconds: 5
            failureThreshold: 6
          livenessProbe:
            exec:
              command: ["pg_isready", "-U", "mousike", "-d", "mousike"]
            initialDelaySeconds: 30
            periodSeconds: 10
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "500m"
  volumeClaimTemplates:
    - metadata:
        name: postgres-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 5Gi
---
apiVersion: v1
kind: Service
metadata:
  name: postgres-service
  namespace: rag
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
  clusterIP: None
```

### [DEPLOY] k8s/docling/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: docling
  namespace: rag
spec:
  replicas: 1
  selector:
    matchLabels:
      app: docling
  template:
    metadata:
      labels:
        app: docling
    spec:
      containers:
        - name: docling
          image: quay.io/docling-project/docling-serve:latest
          ports:
            - containerPort: 5001
          env:
            - name: DOCLING_SERVE_WORKERS
              value: "2"
          volumeMounts:
            - name: docling-cache
              mountPath: /root/.cache/docling
          readinessProbe:
            httpGet:
              path: /health
              port: 5001
            initialDelaySeconds: 60     # First boot downloads ML models (~2-5 min)
            periodSeconds: 15
            failureThreshold: 20
          resources:
            requests:
              memory: "2Gi"
              cpu: "1000m"
            limits:
              memory: "4Gi"
              cpu: "2000m"
      volumes:
        - name: docling-cache
          emptyDir: {}                  # Replace with PVC to persist model cache across restarts
---
apiVersion: v1
kind: Service
metadata:
  name: docling-service
  namespace: rag
spec:
  selector:
    app: docling
  ports:
    - port: 5001
      targetPort: 5001
```

### [DEPLOY] k8s/redis/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: rag
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
          command: ["redis-server", "--save", "60", "1", "--loglevel", "warning"]
          readinessProbe:
            exec:
              command: ["redis-cli", "ping"]
            initialDelaySeconds: 5
            periodSeconds: 3
          resources:
            requests:
              memory: "128Mi"
            limits:
              memory: "256Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: redis-service
  namespace: rag
spec:
  selector:
    app: redis
  ports:
    - port: 6379
      targetPort: 6379
```

### [DEPLOY] k8s/phoenix/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: phoenix
  namespace: rag
spec:
  replicas: 1
  selector:
    matchLabels:
      app: phoenix
  template:
    metadata:
      labels:
        app: phoenix
    spec:
      containers:
        - name: phoenix
          image: arizephoenix/phoenix:latest
          ports:
            - name: ui
              containerPort: 6006
            - name: otlp-grpc
              containerPort: 4317
          env:
            - name: PHOENIX_WORKING_DIR
              value: /phoenix/data
          volumeMounts:
            - name: phoenix-data
              mountPath: /phoenix/data
          readinessProbe:
            httpGet:
              path: /healthz
              port: 6006
            initialDelaySeconds: 15
            periodSeconds: 10
          resources:
            requests:
              memory: "512Mi"
            limits:
              memory: "1Gi"
      volumes:
        - name: phoenix-data
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: phoenix-service
  namespace: rag
spec:
  type: NodePort
  selector:
    app: phoenix
  ports:
    - name: ui
      port: 6006
      targetPort: 6006
      nodePort: 30600
    - name: otlp-grpc
      port: 4317
      targetPort: 4317
```

### [DEPLOY] k8s/grafana/deployment.yaml

```yaml
# grafana/otel-lgtm = Loki + Grafana + Tempo + Prometheus + OTel Collector bundled
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana-lgtm
  namespace: rag
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana-lgtm
  template:
    metadata:
      labels:
        app: grafana-lgtm
    spec:
      containers:
        - name: grafana-lgtm
          image: grafana/otel-lgtm:latest
          ports:
            - name: ui
              containerPort: 3000
            - name: otlp-grpc
              containerPort: 4317
            - name: otlp-http
              containerPort: 4318
            - name: prometheus
              containerPort: 9090
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 20
            periodSeconds: 10
          resources:
            requests:
              memory: "1Gi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: grafana-lgtm-service
  namespace: rag
spec:
  type: NodePort
  selector:
    app: grafana-lgtm
  ports:
    - name: ui
      port: 3000
      targetPort: 3000
      nodePort: 30300
    - name: otlp-http
      port: 4318
      targetPort: 4318
      nodePort: 30418
    - name: otlp-grpc
      port: 4317
      targetPort: 4317
```

### [DEPLOY] k8s/mousike/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mousike
  namespace: rag
  labels:
    app: mousike
    version: "1.0.0"
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mousike
  template:
    metadata:
      labels:
        app: mousike
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8080"
        prometheus.io/path: "/actuator/prometheus"
    spec:
      initContainers:
        - name: wait-for-postgres
          image: busybox:1.36
          command: ['sh', '-c', 'until nc -z postgres-service 5432; do echo waiting for postgres; sleep 2; done']
        - name: wait-for-redis
          image: busybox:1.36
          command: ['sh', '-c', 'until nc -z redis-service 6379; do echo waiting for redis; sleep 2; done']
      containers:
        - name: mousike
          image: mousike-app:latest
          imagePullPolicy: Never
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: rag-config
            - secretRef:
                name: rag-secrets
          env:
            - name: SPRING_DATASOURCE_URL
              value: "jdbc:postgresql://postgres-service:5432/mousike"
            - name: SPRING_AI_OLLAMA_BASE_URL
              valueFrom:
                configMapKeyRef:
                  name: rag-config
                  key: OLLAMA_BASE_URL
            - name: SPRING_DATA_REDIS_HOST
              valueFrom:
                configMapKeyRef:
                  name: rag-config
                  key: REDIS_HOST
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 6
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 60
            periodSeconds: 15
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: mousike-service
  namespace: rag
spec:
  type: NodePort
  selector:
    app: mousike
  ports:
    - port: 8080
      targetPort: 8080
      nodePort: 30080
```

### [DEPLOY] k8s/document-service/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: document-service
  namespace: rag
  labels:
    app: document-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: document-service
  template:
    metadata:
      labels:
        app: document-service
    spec:
      initContainers:
        - name: wait-for-postgres
          image: busybox:1.36
          command: ['sh', '-c', 'until nc -z postgres-service 5432; do sleep 2; done']
        - name: wait-for-docling
          image: busybox:1.36
          command: ['sh', '-c', 'until wget -qO- http://docling-service:5001/health; do echo waiting for docling; sleep 5; done']
      containers:
        - name: document-service
          image: document-service:latest
          imagePullPolicy: Never
          ports:
            - containerPort: 8090
          envFrom:
            - configMapRef:
                name: rag-config
            - secretRef:
                name: rag-secrets
          env:
            - name: SPRING_DATASOURCE_URL
              value: "jdbc:postgresql://postgres-service:5432/mousike"
            - name: SPRING_AI_OLLAMA_BASE_URL
              valueFrom:
                configMapKeyRef:
                  name: rag-config
                  key: OLLAMA_BASE_URL
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8090
            initialDelaySeconds: 20
            periodSeconds: 10
          resources:
            requests:
              memory: "512Mi"
            limits:
              memory: "1Gi"
---
apiVersion: v1
kind: Service
metadata:
  name: document-service
  namespace: rag
spec:
  type: NodePort
  selector:
    app: document-service
  ports:
    - port: 8090
      targetPort: 8090
      nodePort: 30090
```

### [DEPLOY] k8s/ingester/job.yaml

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: document-ingester
  namespace: rag
spec:
  backoffLimit: 3
  template:
    spec:
      restartPolicy: OnFailure
      initContainers:
        - name: wait-for-all
          image: busybox:1.36
          command:
            - /bin/sh
            - -c
            - |
              until nc -z postgres-service 5432; do echo "waiting for postgres"; sleep 3; done
              until wget -qO- http://docling-service:5001/health; do echo "waiting for docling"; sleep 5; done
              until nc -z redis-service 6379; do echo "waiting for redis"; sleep 2; done
              echo "All services ready"
      containers:
        - name: ingester
          image: document-service:latest
          imagePullPolicy: Never
          command: ["java", "-jar", "app.jar", "--spring.profiles.active=ingestion,k8s"]
          envFrom:
            - configMapRef:
                name: rag-config
            - secretRef:
                name: rag-secrets
          env:
            - name: SPRING_DATASOURCE_URL
              value: "jdbc:postgresql://postgres-service:5432/mousike"
            - name: SPRING_AI_OLLAMA_BASE_URL
              valueFrom:
                configMapKeyRef:
                  name: rag-config
                  key: OLLAMA_BASE_URL
```

---

## 8. Gradle Build File

### [IMPLEMENT] settings.gradle.kts

```kotlin
// FILE: settings.gradle.kts
rootProject.name = "mousike-platform"

include(
    "mousike",           // Main application (MCP Client + Vaadin UI + RAG)
    "document-service"   // MCP Server (tools: ingest, search, metadata)
)
```

### [IMPLEMENT] mousike/build.gradle.kts

```kotlin
// FILE: mousike/build.gradle.kts
plugins {
    id("org.springframework.boot") version "3.4.5"
    id("io.spring.dependency-management") version "1.1.7"
    java
}

group = "com.example.mousike"
version = "1.0.0"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

dependencyManagement {
    imports {
        mavenBom("org.springframework.ai:spring-ai-bom:1.0.0")
    }
}

dependencies {
    // ── Spring Boot Core ──────────────────────────────────────────────────────
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-data-redis")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.postgresql:postgresql")

    // ── Spring AI — Ollama (Chat + Embedding) ─────────────────────────────────
    implementation("org.springframework.ai:spring-ai-starter-model-ollama")

    // ── Spring AI — Vector Store (PGVector) ──────────────────────────────────
    implementation("org.springframework.ai:spring-ai-starter-vector-store-pgvector")

    // ── Spring AI — RAG Advisors ──────────────────────────────────────────────
    implementation("org.springframework.ai:spring-ai-advisors-vector-store")

    // ── Spring AI — Chat Memory (Redis) ──────────────────────────────────────
    implementation("org.springframework.ai:spring-ai-starter-memory-redis")

    // ── Spring AI — MCP Client ────────────────────────────────────────────────
    implementation("org.springframework.ai:spring-ai-starter-mcp-client")

    // ── Vaadin UI ─────────────────────────────────────────────────────────────
    implementation("com.vaadin:vaadin-spring-boot-starter:24.5.0")

    // ── Observability — OpenTelemetry (replacing Arconia OpenTelemetry) ───────
    implementation("io.micrometer:micrometer-tracing-bridge-otel")
    implementation("io.opentelemetry:opentelemetry-exporter-otlp")
    runtimeOnly("io.micrometer:micrometer-registry-prometheus")
    // OTel log bridge for Logback (structured log export via OTLP)
    implementation("io.opentelemetry.instrumentation:opentelemetry-logback-appender-1.0:2.12.0-alpha")

    // ── Testing ───────────────────────────────────────────────────────────────
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.ai:spring-ai-test")
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.testcontainers:postgresql")
}
```

### [IMPLEMENT] document-service/build.gradle.kts

```kotlin
// FILE: document-service/build.gradle.kts
plugins {
    id("org.springframework.boot") version "3.4.5"
    id("io.spring.dependency-management") version "1.1.7"
    java
}

group = "com.example.mousike"
version = "1.0.0"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

dependencyManagement {
    imports {
        mavenBom("org.springframework.ai:spring-ai-bom:1.0.0")
    }
}

dependencies {
    // Spring Boot Core
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.postgresql:postgresql")

    // Spring AI — Ollama (for embedding during ingestion)
    implementation("org.springframework.ai:spring-ai-starter-model-ollama")

    // Spring AI — PGVector (stores and queries embeddings)
    implementation("org.springframework.ai:spring-ai-starter-vector-store-pgvector")

    // Spring AI — Docling Document Reader (replaces Arconia Docling)
    implementation("org.springframework.ai:spring-ai-docling-document-reader")

    // Spring AI — MCP Server (exposes tools via HTTP+SSE)
    implementation("org.springframework.ai:spring-ai-starter-mcp-server-webmvc")

    // Observability
    implementation("io.micrometer:micrometer-tracing-bridge-otel")
    implementation("io.opentelemetry:opentelemetry-exporter-otlp")
    runtimeOnly("io.micrometer:micrometer-registry-prometheus")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.testcontainers:postgresql")
}
```

---

## 9. Application Configuration (application.yml)

### [IMPLEMENT] mousike/src/main/resources/application.yml

```yaml
# FILE: mousike/src/main/resources/application.yml
# ALL service URLs are driven by environment variables with localhost defaults for local dev.
# In Kind cluster, env vars are injected from ConfigMap/Secrets.

spring:
  application:
    name: mousike

  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/mousike}
    username: ${POSTGRES_USER:mousike}
    password: ${POSTGRES_PASSWORD:mousike-secret}
    driver-class-name: org.postgresql.Driver
    hikari:
      connection-timeout: 10000
      maximum-pool-size: 10

  jpa:
    hibernate:
      ddl-auto: update
    show-sql: false
    properties:
      hibernate.dialect: org.hibernate.dialect.PostgreSQLDialect
      hibernate.format_sql: true

  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
      timeout: 2000ms
      connect-timeout: 1000ms

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
        dimensions: 768             # Must match nomic-embed-text output dimensions
        initialize-schema: true
        schema-name: public
        table-name: vector_store
        max-document-batch-size: 10000

    # MCP Client — connects to document-service MCP Server
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

    # Spring AI Observations (enables OTel spans for AI calls)
    chat:
      observations:
        enabled: true
        include-prompt: true
        include-completion: true
    embedding:
      observations:
        enabled: true
    vectorstore:
      observations:
        enabled: true

management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus,metrics,env
  endpoint:
    health:
      probes:
        enabled: true
      show-details: always
      show-components: always
  health:
    redis:
      enabled: true
    db:
      enabled: true
  metrics:
    export:
      prometheus:
        enabled: true
    tags:
      application: ${spring.application.name}
  tracing:
    sampling:
      probability: 1.0
  otlp:
    tracing:
      endpoint: ${GRAFANA_OTLP_HTTP_URL:http://localhost:4318}/v1/traces
    logging:
      endpoint: ${GRAFANA_OTLP_HTTP_URL:http://localhost:4318}/v1/logs
    metrics:
      endpoint: ${GRAFANA_OTLP_HTTP_URL:http://localhost:4318}/v1/metrics

logging:
  pattern:
    console: "%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - traceId=%X{traceId} spanId=%X{spanId} - %msg%n"
  level:
    org.springframework.ai: DEBUG
    com.example.mousike: DEBUG
```

### [IMPLEMENT] document-service/src/main/resources/application.yml

```yaml
# FILE: document-service/src/main/resources/application.yml

spring:
  application:
    name: document-service

  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/mousike}
    username: ${POSTGRES_USER:mousike}
    password: ${POSTGRES_PASSWORD:mousike-secret}
    driver-class-name: org.postgresql.Driver

  jpa:
    hibernate:
      ddl-auto: update

  ai:
    ollama:
      base-url: ${SPRING_AI_OLLAMA_BASE_URL:http://localhost:11434}
      embedding:
        model: nomic-embed-text

    vectorstore:
      pgvector:
        index-type: HNSW
        distance-type: COSINE_DISTANCE
        dimensions: 768
        initialize-schema: true
        table-name: vector_store

    # Docling Serve URL — replaces Arconia Docling Dev Service
    docling:
      base-url: ${DOCLING_BASE_URL:http://localhost:5001}

    # MCP Server — exposes tools to MCP Clients (like mousike)
    mcp:
      server:
        enabled: true
        name: document-service
        version: "1.0.0"

server:
  port: 8090

management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus
  endpoint:
    health:
      probes:
        enabled: true
  tracing:
    sampling:
      probability: 1.0
  otlp:
    tracing:
      endpoint: ${GRAFANA_OTLP_HTTP_URL:http://localhost:4318}/v1/traces
```

---

## 10. Spring Boot Code — All Features

### [IMPLEMENT] Package Structure

```
com.example.mousike
├── MouseikeApplication.java
├── config/
│   ├── AiConfig.java              # ChatClient, VectorStore, ChatMemory, Advisor beans
│   ├── ObservabilityConfig.java   # OTel dual-export (Grafana + Phoenix), no Arconia
│   └── RedisConfig.java           # Redis serialization config
├── chat/
│   ├── ChatController.java        # POST /api/chat
│   └── ChatService.java           # Stateful chat with Redis memory + RAG advisor
├── rag/
│   ├── RagController.java         # POST /api/rag/query?mode=naive|advanced|agentic
│   ├── NaiveRagService.java
│   ├── AdvancedRagService.java
│   └── AgenticRagService.java
├── semantic/
│   ├── SemanticSearchController.java  # GET /api/search?q=...&category=...
│   └── SemanticSearchService.java
├── classification/
│   ├── ClassificationController.java  # POST /api/classify
│   └── InstrumentClassifier.java
├── extraction/
│   ├── ExtractionController.java  # POST /api/extract
│   └── ComposerExtractor.java
├── tools/
│   ├── InstrumentTool.java        # @Tool for agentic RAG
│   ├── ComposerTool.java          # @Tool wrapping vector store search
│   └── RecitalTool.java           # @Tool wrapping database writes
├── domain/
│   ├── Instrument.java            # JPA Entity
│   ├── Composer.java              # JPA Entity
│   └── Recital.java               # JPA Entity
├── repository/
│   ├── InstrumentRepository.java
│   ├── ComposerRepository.java
│   └── RecitalRepository.java
└── ui/
    ├── MainLayout.java            # Vaadin main layout with navigation
    ├── ChatView.java              # Vaadin chat view (/chat)
    ├── SearchView.java            # Vaadin semantic search view (/search)
    ├── ComposerView.java          # Vaadin extraction view (/composer)
    └── MonitorView.java           # Links to Phoenix + Grafana
```

### [IMPLEMENT] AiConfig.java

```java
// FILE: mousike/src/main/java/com/example/mousike/config/AiConfig.java
package com.example.mousike.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.client.advisor.vectorstore.QuestionAnswerAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.memory.repository.redis.RedisChatMemoryRepository;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.embedding.EmbeddingModel;
import org.springframework.ai.rag.advisor.RetrievalAugmentationAdvisor;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Duration;

@Configuration
public class AiConfig {

    /**
     * ChatMemory backed by Redis.
     * Replaces Arconia's automatic Redis Dev Service provisioning.
     * Redis URL comes from env var REDIS_HOST / REDIS_PORT via application.yml.
     */
    @Bean
    public ChatMemory chatMemory(StringRedisTemplate redisTemplate) {
        var repository = RedisChatMemoryRepository.builder()
                .redisTemplate(redisTemplate)
                .defaultTtl(Duration.ofHours(2))
                .build();
        return MessageWindowChatMemory.builder()
                .chatMemoryRepository(repository)
                .maxMessages(20)
                .build();
    }

    /**
     * Default ChatClient with:
     * - System prompt from classpath:prompts/system-rag.st
     * - Redis chat memory (last 20 messages per conversation)
     */
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

    /**
     * Separate ChatClient for RAG flows.
     * Includes the RetrievalAugmentationAdvisor for context injection.
     * The RAG mode (naive/advanced/agentic) is controlled at call site.
     */
    @Bean("ragChatClient")
    public ChatClient ragChatClient(ChatModel chatModel, VectorStore vectorStore, ChatMemory chatMemory) {
        return ChatClient.builder(chatModel)
                .defaultSystem("""
                        You are Mousike, an AI assistant for music.
                        Answer ONLY based on the provided context. If the context does not
                        contain enough information, say "I don't have enough information about that."
                        Do NOT hallucinate facts. Cite your sources by referencing document metadata.
                        """)
                .defaultAdvisors(
                        MessageChatMemoryAdvisor.builder(chatMemory).build(),
                        RetrievalAugmentationAdvisor.builder()
                                .vectorStore(vectorStore)
                                .order(0)
                                .build()
                )
                .build();
    }
}
```

### [IMPLEMENT] ObservabilityConfig.java

```java
// FILE: mousike/src/main/java/com/example/mousike/config/ObservabilityConfig.java
package com.example.mousike.config;

import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.exporter.otlp.grpc.OtlpGrpcSpanExporter;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.semconv.ResourceAttributes;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.actuate.autoconfigure.tracing.otlp.OtlpTracingAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * Observability configuration WITHOUT Arconia.
 *
 * Arconia OpenTelemetry was a single-dependency solution that:
 *   1. Auto-configured OTel SDK with Micrometer bridge
 *   2. Started Grafana LGTM container via Dev Services
 *   3. Started Phoenix container via Dev Services
 *
 * We replace it with:
 *   - Spring Boot's built-in OTel + Micrometer integration (spring-boot-starter-actuator
 *     + micrometer-tracing-bridge-otel) for Grafana Tempo traces
 *   - An additional OtlpGrpcSpanExporter bean pointing to Phoenix for LLM-specific tracing
 *   - Both Grafana and Phoenix are already running in Kind (no Dev Services needed)
 *
 * The GRAFANA export is handled automatically by Spring Boot via management.otlp.* in application.yml.
 * The PHOENIX export requires this additional bean.
 */
@Configuration
public class ObservabilityConfig {

    @Value("${PHOENIX_OTLP_GRPC_URL:http://localhost:4317}")
    private String phoenixOtlpUrl;

    /**
     * Additional span exporter sending to Phoenix (Arize) for LLM observability.
     * Phoenix understands prompt/completion/token spans natively.
     * Spring AI auto-instruments ChatModel, EmbeddingModel, VectorStore calls.
     */
    @Bean
    public OtlpGrpcSpanExporter phoenixSpanExporter() {
        return OtlpGrpcSpanExporter.builder()
                .setEndpoint(phoenixOtlpUrl)
                .setTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * OTel Resource attributes — identifies the service in Phoenix and Grafana dashboards.
     */
    @Bean
    public Resource otelResource() {
        return Resource.getDefault().merge(
                Resource.create(Attributes.of(
                        ResourceAttributes.SERVICE_NAME, "mousike",
                        ResourceAttributes.SERVICE_VERSION, "1.0.0",
                        ResourceAttributes.DEPLOYMENT_ENVIRONMENT, "local-kind"
                ))
        );
    }
}
```

### [IMPLEMENT] ChatService.java

```java
// FILE: mousike/src/main/java/com/example/mousike/chat/ChatService.java
package com.example.mousike.chat;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

@Service
public class ChatService {

    private final ChatClient chatClient;
    private final ChatMemory chatMemory;

    public ChatService(ChatClient chatClient, ChatMemory chatMemory) {
        this.chatClient = chatClient;
        this.chatMemory = chatMemory;
    }

    /**
     * Stateful chat. conversationId groups messages into one session.
     * History is stored in Redis and retrieved on each call.
     * @return streaming response as Flux<String>
     */
    public Flux<String> chat(String conversationId, String userMessage) {
        return chatClient.prompt()
                .user(userMessage)
                .advisors(advisor ->
                        advisor.param(MessageChatMemoryAdvisor.CHAT_MEMORY_CONVERSATION_ID_KEY, conversationId)
                )
                .stream()
                .content();
    }

    /**
     * Non-streaming variant for REST API.
     */
    public String chatSync(String conversationId, String userMessage) {
        return chatClient.prompt()
                .user(userMessage)
                .advisors(advisor ->
                        advisor.param(MessageChatMemoryAdvisor.CHAT_MEMORY_CONVERSATION_ID_KEY, conversationId)
                )
                .call()
                .content();
    }

    /**
     * Clear conversation history from Redis for a given session.
     */
    public void clearHistory(String conversationId) {
        chatMemory.clear(conversationId);
    }
}
```

---

## 11. MCP Server Implementation

### Architecture: document-service as MCP Server

The `document-service` Spring Boot app exposes the following tools via the MCP protocol.
It uses `spring-ai-starter-mcp-server-webmvc` which auto-configures HTTP+SSE transport at `/mcp/sse`.

```
document-service (MCP Server, port 8090)
├── POST /mcp/sse                  ← MCP SSE endpoint (Spring AI auto-configures)
├── GET  /actuator/health
├── POST /api/ingest               ← HTTP API for triggering ingestion manually
└── GET  /api/documents            ← List ingested documents

Exposed MCP Tools:
├── searchMusicKnowledge(query, topK, minScore)
├── searchByCategory(query, category)
├── ingestDocument(content, filename, metadata)
└── getDocumentMetadata(sourceId)
```

### [IMPLEMENT] DocumentServiceApplication.java

```java
// FILE: document-service/src/main/java/com/example/mousike/DocumentServiceApplication.java
package com.example.mousike;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class DocumentServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(DocumentServiceApplication.class, args);
    }
}
```

### [IMPLEMENT] MusicKnowledgeTools.java (MCP Server Tools)

```java
// FILE: document-service/src/main/java/com/example/mousike/tools/MusicKnowledgeTools.java
package com.example.mousike.tools;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

/**
 * MCP Tools exposed by the document-service.
 * These methods are registered as MCP tools and callable by Ollama via the MCP Client.
 *
 * FROM THE DIAGRAM:
 *   Ollama (Inference Service) → sends Tool Call Request → MCP Client (in mousike-app)
 *   MCP Client → calls Tool Call → MCP Server API (this class in document-service)
 *   MCP Server → returns Tool Call Response → MCP Client → forwarded to Ollama
 */
@Component
public class MusicKnowledgeTools {

    private static final Logger log = LoggerFactory.getLogger(MusicKnowledgeTools.class);

    private final VectorStore vectorStore;

    public MusicKnowledgeTools(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    /**
     * Primary retrieval tool. Called by Ollama when it needs music knowledge.
     */
    @Tool(
        name = "searchMusicKnowledge",
        description = """
            Search the music knowledge base for information about composers, instruments,
            music theory, music history, or any music-related topic.
            Use this tool when the user asks about music facts, composer biographies,
            instrument characteristics, or historical events in music.
            """
    )
    public String searchMusicKnowledge(
            @ToolParam(description = "The search query. Be specific and descriptive.") String query,
            @ToolParam(description = "Maximum number of results to return. Default: 5") int topK,
            @ToolParam(description = "Minimum similarity score (0.0-1.0). Default: 0.65") double minScore
    ) {
        log.info("MCP Tool called: searchMusicKnowledge query='{}' topK={} minScore={}", query, topK, minScore);

        List<Document> results = vectorStore.similaritySearch(
                SearchRequest.query(query)
                        .withTopK(topK > 0 ? topK : 5)
                        .withSimilarityThreshold(minScore > 0 ? minScore : 0.65)
        );

        if (results.isEmpty()) {
            return "No relevant music knowledge found for query: " + query;
        }

        return results.stream()
                .map(doc -> {
                    var source = doc.getMetadata().getOrDefault("source", "unknown");
                    var score = doc.getMetadata().getOrDefault("distance", "N/A");
                    return String.format("[Source: %s, Score: %s]\n%s", source, score, doc.getText());
                })
                .collect(Collectors.joining("\n\n---\n\n"));
    }

    /**
     * Category-filtered search tool. Useful for targeted instrument queries.
     */
    @Tool(
        name = "searchByCategory",
        description = """
            Search the music knowledge base filtered by category.
            Categories: composers, instruments, theory, history, genres, techniques.
            Use when you need information from a specific domain of music knowledge.
            """
    )
    public String searchByCategory(
            @ToolParam(description = "The search query") String query,
            @ToolParam(description = "Category to filter by: composers, instruments, theory, history, genres, techniques") String category
    ) {
        log.info("MCP Tool called: searchByCategory query='{}' category='{}'", query, category);

        var filterBuilder = new FilterExpressionBuilder();
        var filterExpression = filterBuilder.eq("category", category).build();

        List<Document> results = vectorStore.similaritySearch(
                SearchRequest.query(query)
                        .withTopK(5)
                        .withSimilarityThreshold(0.6)
                        .withFilterExpression(filterExpression)
        );

        if (results.isEmpty()) {
            return String.format("No results found for '%s' in category '%s'", query, category);
        }

        return results.stream()
                .map(doc -> String.format("[%s] %s",
                        doc.getMetadata().getOrDefault("title", "Untitled"),
                        doc.getText()))
                .collect(Collectors.joining("\n\n"));
    }

    /**
     * Get metadata about available documents (helps the LLM understand what's ingested).
     */
    @Tool(
        name = "listAvailableDocuments",
        description = "List the documents available in the music knowledge base. Use this to understand what sources are available before searching."
    )
    public String listAvailableDocuments() {
        // Return metadata about ingested document sources
        // In a real implementation, query a documents table in PostgreSQL
        return """
            Available knowledge sources:
            - music-theory.pdf: Comprehensive music theory guide (scales, chords, harmony)
            - composers-biographies.pdf: Major classical composers (Bach, Mozart, Beethoven, etc.)
            - instruments-encyclopedia.pdf: Encyclopedia of musical instruments
            - jazz-history.pdf: History of jazz and notable artists
            - contemporary-music.pdf: 20th and 21st century music movements
            """;
    }
}
```

### [IMPLEMENT] McpServerConfig.java

```java
// FILE: document-service/src/main/java/com/example/mousike/config/McpServerConfig.java
package com.example.mousike.config;

import com.example.mousike.tools.MusicKnowledgeTools;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.ai.tool.method.MethodToolCallbackProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers MCP tools with the Spring AI MCP Server.
 * The MCP Server starter (spring-ai-starter-mcp-server-webmvc) auto-configures
 * the SSE endpoint at /mcp/sse. We just need to register the tool beans.
 */
@Configuration
public class McpServerConfig {

    /**
     * Registers all @Tool methods from MusicKnowledgeTools as MCP tools.
     * These will be discoverable by any MCP Client that connects to /mcp/sse.
     */
    @Bean
    public ToolCallbackProvider musicKnowledgeToolProvider(MusicKnowledgeTools musicKnowledgeTools) {
        return MethodToolCallbackProvider.builder()
                .toolObjects(musicKnowledgeTools)
                .build();
    }
}
```

---

## 12. MCP Client Integration

### [IMPLEMENT] McpClientConfig.java (in mousike-app)

```java
// FILE: mousike/src/main/java/com/example/mousike/config/McpClientConfig.java
package com.example.mousike.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.mcp.SyncMcpToolCallbackProvider;
import org.springframework.ai.tool.ToolCallbackProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Integrates the MCP Client tools into a ChatClient.
 *
 * FROM THE DIAGRAM:
 *   The MCP Client (this class) is the bridge between:
 *   1. The Inference Service (Ollama) — which DECIDES when to call tools
 *   2. The MCP Server API (document-service) — which EXECUTES the tools
 *
 * Spring AI's MCP Client starter auto-discovers tools from all configured MCP Servers
 * via SSE (spring.ai.mcp.client.sse.connections in application.yml).
 * We inject those tools into a ChatClient so Ollama knows they exist.
 */
@Configuration
public class McpClientConfig {

    /**
     * ChatClient with MCP tools injected.
     * When Ollama receives a question, it can see the tool descriptors and decide
     * to call searchMusicKnowledge(), searchByCategory(), etc.
     * Ollama returns a Tool Call Request → MCP Client executes it → Tool Call Response.
     */
    @Bean("agenticChatClient")
    public ChatClient agenticChatClient(
            ChatModel chatModel,
            ChatMemory chatMemory,
            SyncMcpToolCallbackProvider mcpToolCallbackProvider  // auto-configured by MCP Client starter
    ) {
        return ChatClient.builder(chatModel)
                .defaultSystem("""
                        You are Mousike, an AI assistant for music. You have access to a music
                        knowledge base through tools. Use the tools to find accurate information
                        before answering. Always cite your sources.
                        Available tools: searchMusicKnowledge, searchByCategory, listAvailableDocuments.
                        """)
                .defaultTools(mcpToolCallbackProvider.getToolCallbacks())
                .build();
    }
}
```

### [IMPLEMENT] AgenticRagService.java

```java
// FILE: mousike/src/main/java/com/example/mousike/rag/AgenticRagService.java
package com.example.mousike.rag;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

/**
 * Agentic RAG using MCP tools.
 *
 * Flow (matches the diagram exactly):
 * 1. User Question → AgenticRagService.query()
 * 2. ChatClient sends Request to Ollama with tool descriptors attached
 * 3. Ollama returns Tool Call Request (e.g., call searchMusicKnowledge("Bach cantatas"))
 * 4. Spring AI MCP Client executes the tool call against document-service MCP Server
 * 5. document-service searches PGVector, returns Tool Call Response (relevant chunks)
 * 6. Spring AI sends Tool Call Response back to Ollama
 * 7. Ollama generates final Response → returned as Answer
 */
@Service
public class AgenticRagService {

    private final ChatClient agenticChatClient;
    private final ChatMemory chatMemory;

    public AgenticRagService(
            @Qualifier("agenticChatClient") ChatClient agenticChatClient,
            ChatMemory chatMemory) {
        this.agenticChatClient = agenticChatClient;
        this.chatMemory = chatMemory;
    }

    public String query(String conversationId, String question) {
        return agenticChatClient.prompt()
                .user(question)
                .advisors(advisor ->
                        advisor.param(MessageChatMemoryAdvisor.CHAT_MEMORY_CONVERSATION_ID_KEY, conversationId)
                )
                .call()
                .content();
    }
}
```

---

## 13. Modular RAG Patterns

### [IMPLEMENT] NaiveRagService.java

```java
// FILE: mousike/src/main/java/com/example/mousike/rag/NaiveRagService.java
package com.example.mousike.rag;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.rag.advisor.RetrievalAugmentationAdvisor;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

/**
 * Naive RAG: embed query → retrieve top-k chunks → inject as context → generate.
 * No query transformation. No re-ranking. The simplest possible RAG.
 * Uses RetrievalAugmentationAdvisor with all defaults.
 */
@Service
public class NaiveRagService {

    private final ChatClient chatClient;
    private final VectorStore vectorStore;

    public NaiveRagService(
            @Qualifier("ragChatClient") ChatClient chatClient,
            VectorStore vectorStore) {
        this.chatClient = chatClient;
        this.vectorStore = vectorStore;
    }

    public String query(String question) {
        return chatClient.prompt()
                .user(question)
                .call()
                .content();
    }
}
```

### [IMPLEMENT] AdvancedRagService.java

```java
// FILE: mousike/src/main/java/com/example/mousike/rag/AdvancedRagService.java
package com.example.mousike.rag;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.rag.advisor.RetrievalAugmentationAdvisor;
import org.springframework.ai.rag.postretrieval.document.DocumentPostProcessor;
import org.springframework.ai.rag.postretrieval.document.ScoreDocumentPostProcessor;
import org.springframework.ai.rag.preretrieval.query.transformation.RewriteQueryTransformer;
import org.springframework.ai.rag.preretrieval.query.transformation.TranslationQueryTransformer;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;

/**
 * Advanced RAG with pre-retrieval query transformation and post-retrieval filtering.
 *
 * Pipeline:
 *   UserQuery
 *     → RewriteQueryTransformer (LLM rewrites query for better retrieval)
 *     → TranslationQueryTransformer (ensures query is in English for consistent embedding)
 *     → VectorStore.similaritySearch()
 *     → ScoreDocumentPostProcessor (removes chunks below similarity threshold 0.65)
 *     → Context injection into prompt
 *     → Ollama generates answer
 */
@Service
public class AdvancedRagService {

    private final ChatClient chatClient;
    private final VectorStore vectorStore;
    private final ChatModel chatModel;

    public AdvancedRagService(ChatModel chatModel, VectorStore vectorStore) {
        this.chatModel = chatModel;
        this.vectorStore = vectorStore;

        // Build advanced advisor chain
        var rewriteTransformer = RewriteQueryTransformer.builder()
                .chatClientBuilder(ChatClient.builder(chatModel))
                .build();

        var translationTransformer = TranslationQueryTransformer.builder()
                .chatClientBuilder(ChatClient.builder(chatModel))
                .targetLanguage("english")
                .build();

        var scoreFilter = new ScoreDocumentPostProcessor(0.65);

        var advisor = RetrievalAugmentationAdvisor.builder()
                .vectorStore(vectorStore)
                .queryTransformers(rewriteTransformer, translationTransformer)
                .documentPostProcessors(scoreFilter)
                .order(0)
                .build();

        this.chatClient = ChatClient.builder(chatModel)
                .defaultSystem("""
                        You are Mousike. Answer based ONLY on the retrieved context.
                        If context is insufficient, say so. Cite sources.
                        """)
                .defaultAdvisors(advisor)
                .build();
    }

    public String query(String question) {
        return chatClient.prompt()
                .user(question)
                .call()
                .content();
    }
}
```

### [IMPLEMENT] RagController.java

```java
// FILE: mousike/src/main/java/com/example/mousike/rag/RagController.java
package com.example.mousike.rag;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/rag")
public class RagController {

    private final NaiveRagService naiveRagService;
    private final AdvancedRagService advancedRagService;
    private final AgenticRagService agenticRagService;

    public RagController(NaiveRagService naiveRagService,
                         AdvancedRagService advancedRagService,
                         AgenticRagService agenticRagService) {
        this.naiveRagService = naiveRagService;
        this.advancedRagService = advancedRagService;
        this.agenticRagService = agenticRagService;
    }

    /**
     * Unified RAG query endpoint.
     * @param mode naive | advanced | agentic (default: advanced)
     * @param conversationId For agentic mode with memory
     */
    @PostMapping("/query")
    public ResponseEntity<Map<String, String>> query(
            @RequestParam(defaultValue = "advanced") String mode,
            @RequestParam(required = false, defaultValue = "default") String conversationId,
            @RequestBody Map<String, String> request) {

        String question = request.get("question");
        if (question == null || question.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "question is required"));
        }

        String answer = switch (mode) {
            case "naive"    -> naiveRagService.query(question);
            case "agentic"  -> agenticRagService.query(conversationId, question);
            default         -> advancedRagService.query(question);
        };

        return ResponseEntity.ok(Map.of(
                "question", question,
                "answer", answer,
                "mode", mode
        ));
    }
}
```

---

## 14. Document Ingestion Pipeline

### [IMPLEMENT] DocumentIngestionService.java (in document-service)

```java
// FILE: document-service/src/main/java/com/example/mousike/ingestion/DocumentIngestionService.java
package com.example.mousike.ingestion;

import io.docling.spring.ai.DoclingDocumentReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * ETL Ingestion Pipeline.
 *
 * Replaces Arconia's auto-configured Docling Dev Service.
 * Reads DOCLING_BASE_URL from env var → ConfigMap in Kind cluster.
 *
 * Pipeline:
 *   Resource (PDF/DOCX/PPTX)
 *     → DoclingDocumentReader (calls Docling Serve HTTP API at DOCLING_BASE_URL)
 *     → Docling returns structured text with layout, tables, OCR
 *     → TokenTextSplitter (1000 tokens, 200 overlap)
 *     → EmbeddingModel (nomic-embed-text via Ollama)  ← auto-invoked by VectorStore.accept()
 *     → VectorStore (PGVector) persists chunks + embeddings
 */
@Service
public class DocumentIngestionService {

    private static final Logger log = LoggerFactory.getLogger(DocumentIngestionService.class);

    @Value("${spring.ai.docling.base-url:http://localhost:5001}")
    private String doclingBaseUrl;

    private final VectorStore vectorStore;

    // Chunk configuration:
    // - chunkSize: 1000 tokens (fits nomic-embed-text's 8192 token window with headroom)
    // - overlap: 200 tokens (preserves context across chunk boundaries)
    private final TokenTextSplitter textSplitter = new TokenTextSplitter(1000, 200, 5, 10000, true);

    public DocumentIngestionService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    /**
     * Ingest a single document resource via Docling Serve.
     * This is the core of the ETL pipeline (Extract-Transform-Load).
     */
    public IngestionResult ingest(Resource resource, String category) {
        log.info("Starting ingestion: file={} category={}", resource.getFilename(), category);

        try {
            // EXTRACT: Docling Serve parses document into structured text
            // DoclingDocumentReader reads DOCLING_BASE_URL from spring.ai.docling.base-url
            var reader = DoclingDocumentReader.builder()
                    .resource(resource)
                    .doclingServeUrl(doclingBaseUrl)
                    .build();

            List<Document> rawDocs = reader.get();
            log.info("Docling parsed {} documents from {}", rawDocs.size(), resource.getFilename());

            // TRANSFORM: Enrich metadata + chunk
            List<Document> enrichedDocs = rawDocs.stream()
                    .map(doc -> {
                        doc.getMetadata().put("source", resource.getFilename());
                        doc.getMetadata().put("category", category);
                        doc.getMetadata().put("ingested_at", System.currentTimeMillis());
                        return doc;
                    })
                    .toList();

            List<Document> chunks = textSplitter.apply(enrichedDocs);
            log.info("Split into {} chunks", chunks.size());

            // LOAD: Embed via Ollama (nomic-embed-text) + store in PGVector
            vectorStore.accept(chunks);
            log.info("Ingestion complete: {} chunks stored in PGVector", chunks.size());

            return new IngestionResult(resource.getFilename(), chunks.size(), true, null);

        } catch (Exception e) {
            log.error("Ingestion failed for {}: {}", resource.getFilename(), e.getMessage(), e);
            return new IngestionResult(resource.getFilename(), 0, false, e.getMessage());
        }
    }

    public record IngestionResult(String filename, int chunksIngested, boolean success, String errorMessage) {}
}
```

### [IMPLEMENT] IngestionStartupRunner.java (for ingestion profile)

```java
// FILE: document-service/src/main/java/com/example/mousike/ingestion/IngestionStartupRunner.java
package com.example.mousike.ingestion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Runs at startup only when profile 'ingestion' is active.
 * Triggered by the Kubernetes Job (k8s/ingester/job.yaml).
 * Ingests all sample documents then exits (Kubernetes Job completes).
 */
@Component
@Profile("ingestion")
public class IngestionStartupRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(IngestionStartupRunner.class);

    private final DocumentIngestionService ingestionService;

    public IngestionStartupRunner(DocumentIngestionService ingestionService) {
        this.ingestionService = ingestionService;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("=== Starting bulk document ingestion ===");

        // Define documents to ingest from src/main/resources/docs/
        var documents = new String[][]{
                {"docs/music-theory.pdf",          "theory"},
                {"docs/composers-biographies.pdf", "composers"},
                {"docs/instruments-encyclopedia.pdf", "instruments"},
                {"docs/jazz-history.pdf",          "history"},
        };

        int totalChunks = 0;
        for (String[] doc : documents) {
            var resource = new ClassPathResource(doc[0]);
            if (resource.exists()) {
                var result = ingestionService.ingest(resource, doc[1]);
                if (result.success()) {
                    totalChunks += result.chunksIngested();
                    log.info("✓ {} → {} chunks", doc[0], result.chunksIngested());
                } else {
                    log.error("✗ {} → FAILED: {}", doc[0], result.errorMessage());
                }
            } else {
                log.warn("Skipping {} — resource not found on classpath", doc[0]);
            }
        }

        log.info("=== Ingestion complete: {} total chunks stored ===", totalChunks);
    }
}
```

---

## 15. Observability — Phoenix + Grafana (No Arconia)

### What Each Tool Shows

**Phoenix (port 6006) — LLM-Specific Observability**
- Every `ChatModel.call()` → span with full prompt text, completion text, token counts, latency
- Every `VectorStore.similaritySearch()` → span with query, top-k results, similarity scores
- Every `EmbeddingModel.embed()` → span with input text, vector dimensions, latency
- Session-level view: group all spans by `conversationId` to see full dialogue traces
- Evaluation tab: score RAG answers for faithfulness, relevance, completeness

**Grafana (port 3000) — Infrastructure Observability**
- Prometheus metrics: JVM heap, HTTP request rates, Spring AI custom metrics
- Tempo traces: distributed request tracing across mousike → document-service → postgres → ollama
- Loki logs: all application logs with trace ID correlation (click log → jump to trace)
- Pre-built Spring Boot dashboard available in Grafana marketplace

### Spring AI OTel Auto-Instrumentation

Spring AI 1.x automatically instruments all AI operations when these properties are set:

```yaml
spring:
  ai:
    chat:
      observations:
        enabled: true
        include-prompt: true        # WARNING: contains user input — disable in production if PII concern
        include-completion: true    # WARNING: contains LLM output
    embedding:
      observations:
        enabled: true
    vectorstore:
      observations:
        enabled: true
```

Resulting OTel span attributes for a chat call:
```
gen_ai.system = "ollama"
gen_ai.operation.name = "chat"
gen_ai.request.model = "llama3.2"
gen_ai.response.model = "llama3.2"
gen_ai.usage.input_tokens = 412
gen_ai.usage.output_tokens = 89
gen_ai.prompt = "[full prompt text]"     # if include-prompt=true
gen_ai.completion = "[full response]"    # if include-completion=true
```

### [IMPLEMENT] Logback Configuration for OTel Log Bridge

```xml
<!-- FILE: mousike/src/main/resources/logback-spring.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <!-- Console appender with trace ID in pattern -->
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - traceId=%X{traceId} - %msg%n</pattern>
        </encoder>
    </appender>

    <!-- OpenTelemetry log bridge — sends structured logs to Grafana Loki via OTLP -->
    <!-- Endpoint configured via management.otlp.logging.endpoint in application.yml -->
    <appender name="OTEL" class="io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender">
        <captureCodeAttributes>true</captureCodeAttributes>
        <captureMarkerAttribute>true</captureMarkerAttribute>
        <captureMdcAttributes>traceId,spanId</captureMdcAttributes>
    </appender>

    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
        <appender-ref ref="OTEL"/>
    </root>

    <logger name="com.example.mousike" level="DEBUG"/>
    <logger name="org.springframework.ai" level="DEBUG"/>
</configuration>
```

---

## 16. Vaadin UI

### [IMPLEMENT] ChatView.java

```java
// FILE: mousike/src/main/java/com/example/mousike/ui/ChatView.java
package com.example.mousike.ui;

import com.example.mousike.chat.ChatService;
import com.vaadin.flow.component.Key;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.html.Div;
import com.vaadin.flow.component.html.H2;
import com.vaadin.flow.component.html.Paragraph;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.select.Select;
import com.vaadin.flow.component.textfield.TextField;
import com.vaadin.flow.router.PageTitle;
import com.vaadin.flow.router.Route;

import java.util.UUID;

@Route(value = "chat", layout = MainLayout.class)
@PageTitle("Chat — Mousike")
public class ChatView extends VerticalLayout {

    private final ChatService chatService;
    private final String conversationId = UUID.randomUUID().toString();
    private final Div messageContainer = new Div();

    public ChatView(ChatService chatService) {
        this.chatService = chatService;

        add(new H2("Composer Assistant Chat"));

        messageContainer.setWidthFull();
        messageContainer.getStyle().set("min-height", "400px")
                .set("overflow-y", "auto")
                .set("padding", "10px")
                .set("border", "1px solid #ddd")
                .set("border-radius", "4px");

        var modeSelector = new Select<String>();
        modeSelector.setItems("RAG Chat (Advanced)", "Direct Chat", "Agentic Chat (MCP)");
        modeSelector.setValue("RAG Chat (Advanced)");
        modeSelector.setLabel("Mode");

        var messageInput = new TextField();
        messageInput.setPlaceholder("Ask about music, composers, instruments...");
        messageInput.setWidthFull();

        var sendButton = new Button("Send");
        sendButton.addClickShortcut(Key.ENTER);
        sendButton.addClickListener(e -> {
            String message = messageInput.getValue();
            if (!message.isBlank()) {
                addMessage("You", message, "user-message");
                messageInput.clear();
                // Streaming response
                StringBuilder responseBuilder = new StringBuilder();
                var responseBubble = addMessage("Mousike", "...", "assistant-message");
                chatService.chat(conversationId, message)
                        .doOnNext(token -> {
                            responseBuilder.append(token);
                            getUI().ifPresent(ui -> ui.access(() ->
                                    responseBubble.setText(responseBuilder.toString())));
                        })
                        .subscribe();
            }
        });

        var clearButton = new Button("Clear History");
        clearButton.addClickListener(e -> {
            chatService.clearHistory(conversationId);
            messageContainer.removeAll();
        });

        var inputRow = new HorizontalLayout(messageInput, sendButton, clearButton);
        inputRow.setWidthFull();
        inputRow.setAlignItems(Alignment.END);

        add(modeSelector, messageContainer, inputRow);
        setWidthFull();
    }

    private Paragraph addMessage(String sender, String text, String cssClass) {
        var msg = new Paragraph(sender + ": " + text);
        msg.addClassName(cssClass);
        messageContainer.add(msg);
        return msg;
    }
}
```

---

## 17. Testing Strategy

### Unit Test Pattern (No containers)

```java
// FILE: mousike/src/test/java/com/example/mousike/rag/NaiveRagServiceTest.java
@ExtendWith(MockitoExtension.class)
class NaiveRagServiceTest {

    @Mock ChatClient chatClient;
    @Mock ChatClient.ChatClientRequestSpec requestSpec;
    @Mock ChatClient.CallResponseSpec callResponseSpec;
    @Mock VectorStore vectorStore;

    @Test
    void shouldReturnAnswerBasedOnRetrievedContext() {
        when(chatClient.prompt()).thenReturn(requestSpec);
        when(requestSpec.user(anyString())).thenReturn(requestSpec);
        when(requestSpec.call()).thenReturn(callResponseSpec);
        when(callResponseSpec.content()).thenReturn("Bach was a German composer.");

        // Construct service with mocks
        // Assert answer is non-null and matches mock
    }
}
```

### Integration Test Pattern (Testcontainers — test scope only)

```java
// FILE: document-service/src/test/java/com/example/mousike/ingestion/IngestionIntegrationTest.java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class IngestionIntegrationTest {

    // PGVector container for integration tests ONLY
    // This is NOT used at runtime — the cluster has PostgreSQL
    @Container
    static PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>(DockerImageName.parse("ankane/pgvector:latest")
                    .asCompatibleSubstituteFor("postgres"))
                    .withDatabaseName("mousike")
                    .withUsername("mousike")
                    .withPassword("mousike-secret");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        // Point at real local Ollama for embedding
        registry.add("spring.ai.ollama.base-url", () -> "http://localhost:11434");
        // Docling is optional for integration test — skip if not available
        registry.add("spring.ai.docling.base-url", () -> "http://localhost:5001");
    }

    @Autowired VectorStore vectorStore;
    @Autowired DocumentIngestionService ingestionService;

    @Test
    void shouldIngestAndRetrieveDocument() {
        // Ingest a small test document
        var result = ingestionService.ingest(
            new ClassPathResource("test-docs/test-music.pdf"), "test");

        assertThat(result.success()).isTrue();
        assertThat(result.chunksIngested()).isGreaterThan(0);

        // Verify retrieval works
        var results = vectorStore.similaritySearch(
            SearchRequest.query("music theory scales").withTopK(3));
        assertThat(results).isNotEmpty();
    }
}
```

---

## 18. Deployment Runbook

### Step-by-Step Deployment

```bash
# ─── PREREQUISITES ────────────────────────────────────────────────────────────
# 1. Kind installed: https://kind.sigs.k8s.io/docs/user/quick-start/
# 2. kubectl installed
# 3. Ollama installed and running (see Section 19)
# 4. Docker running (for building images)
# 5. Java 21 + Gradle

# ─── STEP 1: Start Ollama on host ─────────────────────────────────────────────
OLLAMA_HOST=0.0.0.0:11434 ollama serve &
ollama pull llama3.2
ollama pull nomic-embed-text
# Verify: curl http://localhost:11434/api/tags

# ─── STEP 2: Create Kind cluster ──────────────────────────────────────────────
kind create cluster --config k8s/kind-config.yaml
kubectl create namespace rag
kubectl config set-context --current --namespace=rag

# ─── STEP 3: Deploy infrastructure ───────────────────────────────────────────
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/redis/
kubectl apply -f k8s/docling/
kubectl apply -f k8s/phoenix/
kubectl apply -f k8s/grafana/

# Wait for infra (Docling takes 2-5 min first boot for ML model download)
kubectl rollout status statefulset/postgres -n rag --timeout=120s
kubectl rollout status deployment/redis -n rag --timeout=60s
kubectl rollout status deployment/docling -n rag --timeout=300s
kubectl rollout status deployment/phoenix -n rag --timeout=60s
kubectl rollout status deployment/grafana-lgtm -n rag --timeout=60s

# ─── STEP 4: Build and load app images ────────────────────────────────────────
./gradlew :mousike:bootBuildImage --imageName=mousike-app:latest
./gradlew :document-service:bootBuildImage --imageName=document-service:latest
kind load docker-image mousike-app:latest --name mousike-cluster
kind load docker-image document-service:latest --name mousike-cluster

# ─── STEP 5: Deploy applications ──────────────────────────────────────────────
kubectl apply -f k8s/document-service/
kubectl apply -f k8s/mousike/
kubectl rollout status deployment/document-service -n rag --timeout=120s
kubectl rollout status deployment/mousike -n rag --timeout=120s

# ─── STEP 6: Run ingestion ────────────────────────────────────────────────────
kubectl apply -f k8s/ingester/job.yaml
kubectl wait --for=condition=complete job/document-ingester -n rag --timeout=300s
kubectl logs job/document-ingester -n rag

# ─── STEP 7: Verify ───────────────────────────────────────────────────────────
# App health
curl http://localhost:8080/actuator/health
# Test naive RAG
curl -X POST http://localhost:8080/api/rag/query?mode=naive \
  -H "Content-Type: application/json" \
  -d '{"question": "Tell me about Johann Sebastian Bach"}'
# Test agentic RAG (uses MCP)
curl -X POST http://localhost:8080/api/rag/query?mode=agentic \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the difference between a violin and a viola?"}'
# Open Vaadin UI
open http://localhost:8080/chat
# Open Phoenix
open http://localhost:6006
# Open Grafana
open http://localhost:3000

# ─── RE-DEPLOY APP AFTER CODE CHANGES ────────────────────────────────────────
./gradlew :mousike:bootBuildImage --imageName=mousike-app:latest
kind load docker-image mousike-app:latest --name mousike-cluster
kubectl rollout restart deployment/mousike -n rag
kubectl rollout status deployment/mousike -n rag
```

### Troubleshooting

```bash
# Ollama not reachable from pods?
kubectl run curl-test --image=curlimages/curl --rm -it -- \
  curl http://host.docker.internal:11434/api/tags
# If it fails, get Docker bridge IP:
HOST_IP=$(docker network inspect kind | jq -r '.[0].IPAM.Config[0].Gateway')
# Then update ConfigMap: OLLAMA_BASE_URL: "http://$HOST_IP:11434"

# Docling not ready?
kubectl logs deployment/docling -n rag -f
# Normal: "Downloading model files..." for first 2-5 minutes

# PGVector schema issues?
kubectl exec -it statefulset/postgres -n rag -- \
  psql -U mousike -d mousike -c "SELECT extname FROM pg_extension;"
# Should show: vector

# Check ingestion result
kubectl exec -it statefulset/postgres -n rag -- \
  psql -U mousike -d mousike -c "SELECT count(*) FROM vector_store;"
```

---

## 19. Ollama Host Setup

### Installation & Configuration

```bash
# Install Ollama (Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Install Ollama (Mac)
brew install ollama

# Configure to listen on all interfaces (required for Kind pods to reach it)
# Linux: Create systemd override
sudo mkdir -p /etc/systemd/system/ollama.service.d
cat << 'EOF' | sudo tee /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF
sudo systemctl daemon-reload
sudo systemctl restart ollama

# Mac: Set env var before starting
OLLAMA_HOST=0.0.0.0:11434 ollama serve

# Pull required models
ollama pull llama3.2           # Chat model (2GB) — fast, good quality
ollama pull nomic-embed-text   # Embedding model (274MB) — 768 dimensions

# Optional: Better quality chat models
ollama pull mistral            # 4.1GB — excellent for RAG
ollama pull gemma2:9b          # 5.4GB — very strong instruction following

# Verify
curl http://localhost:11434/api/tags | jq '.models[].name'
```

### Spring AI Ollama Health Check

Spring Boot will log a warning if Ollama is not reachable on startup. The actuator health endpoint shows Ollama status:
```
GET /actuator/health
→ "ollama": {"status": "UP", "details": {"version": "0.x.x"}}
```

---

## 20. File Tree — Complete Project Structure

```
mousike-platform/
├── settings.gradle.kts                         # Multi-project build
├── k8s/
│   ├── kind-config.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml
│   ├── postgres/
│   │   └── statefulset.yaml                    # StatefulSet + headless Service
│   ├── docling/
│   │   └── deployment.yaml
│   ├── redis/
│   │   └── deployment.yaml
│   ├── phoenix/
│   │   └── deployment.yaml
│   ├── grafana/
│   │   └── deployment.yaml
│   ├── mousike/
│   │   └── deployment.yaml
│   ├── document-service/
│   │   └── deployment.yaml
│   └── ingester/
│       └── job.yaml
├── scripts/
│   └── cluster-up.sh
│
├── mousike/                                    # Main application (MCP Client)
│   ├── build.gradle.kts
│   └── src/
│       ├── main/
│       │   ├── java/com/example/mousike/
│       │   │   ├── MouseikeApplication.java
│       │   │   ├── config/
│       │   │   │   ├── AiConfig.java           # ChatClient, VectorStore, ChatMemory
│       │   │   │   ├── McpClientConfig.java    # MCP Client → document-service
│       │   │   │   ├── ObservabilityConfig.java # Dual OTel (Grafana + Phoenix)
│       │   │   │   └── RedisConfig.java
│       │   │   ├── chat/
│       │   │   │   ├── ChatController.java
│       │   │   │   └── ChatService.java
│       │   │   ├── rag/
│       │   │   │   ├── RagController.java
│       │   │   │   ├── NaiveRagService.java
│       │   │   │   ├── AdvancedRagService.java
│       │   │   │   └── AgenticRagService.java  # Uses MCP tools via MCP Client
│       │   │   ├── semantic/
│       │   │   │   ├── SemanticSearchController.java
│       │   │   │   └── SemanticSearchService.java
│       │   │   ├── classification/
│       │   │   │   ├── ClassificationController.java
│       │   │   │   └── InstrumentClassifier.java
│       │   │   ├── extraction/
│       │   │   │   ├── ExtractionController.java
│       │   │   │   └── ComposerExtractor.java
│       │   │   ├── domain/
│       │   │   │   ├── Instrument.java
│       │   │   │   ├── Composer.java
│       │   │   │   └── Recital.java
│       │   │   └── ui/
│       │   │       ├── MainLayout.java
│       │   │       ├── ChatView.java
│       │   │       ├── SearchView.java
│       │   │       ├── ComposerView.java
│       │   │       └── MonitorView.java
│       │   └── resources/
│       │       ├── application.yml
│       │       ├── application-k8s.yml        # K8s-specific overrides
│       │       ├── logback-spring.xml         # OTel Logback appender
│       │       ├── prompts/
│       │       │   ├── system-rag.st
│       │       │   ├── system-classifier.st
│       │       │   └── system-extractor.st
│       │       └── static/                    # Vaadin resources
│       └── test/
│           └── java/com/example/mousike/
│               ├── rag/NaiveRagServiceTest.java
│               ├── rag/AdvancedRagServiceTest.java
│               └── chat/ChatServiceTest.java
│
└── document-service/                          # MCP Server + Document ETL
    ├── build.gradle.kts
    └── src/
        ├── main/
        │   ├── java/com/example/mousike/
        │   │   ├── DocumentServiceApplication.java
        │   │   ├── config/
        │   │   │   ├── McpServerConfig.java    # Registers @Tool beans with MCP Server
        │   │   │   └── ObservabilityConfig.java
        │   │   ├── tools/
        │   │   │   └── MusicKnowledgeTools.java # @Tool methods exposed via MCP
        │   │   ├── ingestion/
        │   │   │   ├── DocumentIngestionService.java # ETL: Docling → PGVector
        │   │   │   ├── IngestionController.java
        │   │   │   └── IngestionStartupRunner.java   # @Profile("ingestion") Job runner
        │   │   └── domain/
        │   │       └── DocumentMetadata.java
        │   └── resources/
        │       ├── application.yml
        │       ├── application-k8s.yml
        │       ├── logback-spring.xml
        │       └── docs/                      # Sample PDFs to ingest
        │           ├── music-theory.pdf
        │           ├── composers-biographies.pdf
        │           ├── instruments-encyclopedia.pdf
        │           └── jazz-history.pdf
        └── test/
            └── java/com/example/mousike/
                ├── ingestion/IngestionIntegrationTest.java
                └── tools/MusicKnowledgeToolsTest.java
```

---

## 21. Anti-Hallucination Guardrails — MANDATORY

> **FOR CLAUDE AGENT:** This section defines a hard rule.
> Every RAG service, MCP tool, chat endpoint, and system prompt in this project
> MUST implement the "no-data = no-answer" contract described below.
> Do NOT generate any code that allows the LLM to answer from its own training
> knowledge when the vector store returns empty or low-confidence results.
> This is not optional. It is a core correctness requirement.

---

### 21.1 The Problem: Why Models Hallucinate in RAG

When `VectorStore.similaritySearch()` returns zero results, or returns chunks with
similarity scores below the acceptable threshold, the LLM still receives a prompt.
Without explicit instructions, the LLM will fill the context gap with its own
training knowledge — producing confident-sounding but ungrounded answers.

This is called **context leakage hallucination** and it is the most common failure
mode in RAG systems.

### 21.2 Three-Layer Defence — ALL THREE Must Be Implemented

```
Layer 1: RETRIEVAL GATE    — Block at the Java service level before calling the LLM
Layer 2: SYSTEM PROMPT     — Instruct the LLM to refuse if context is empty or weak
Layer 3: OUTPUT VALIDATOR  — Inspect the LLM response and reject answers that cite
                             facts not present in the retrieved chunks
```

**All three layers work together. Implementing only one or two is insufficient.**

---

### 21.3 Layer 1 — Retrieval Gate (Java Code)

Every RAG service MUST check the retrieval result BEFORE invoking the LLM.
If retrieval returns nothing meaningful, return a structured "no data" response
immediately without ever calling `chatClient.prompt()...call()`.

#### [IMPLEMENT] RagRetrievalGate.java

```java
// FILE: mousike/src/main/java/com/example/mousike/rag/RagRetrievalGate.java
package com.example.mousike.rag;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * ANTI-HALLUCINATION LAYER 1: Retrieval Gate.
 *
 * Checks whether the vector store contains relevant data BEFORE the LLM is called.
 * If no relevant data is found above the confidence threshold, the gate blocks
 * the request and returns a NO_DATA signal.
 * The caller must return a safe "I don't know" response — never forward to the LLM.
 *
 * RULE: The LLM must NEVER be called when retrievalResult.hasData() == false.
 */
@Component
public class RagRetrievalGate {

    // Hard minimum: any chunk below this score is considered irrelevant noise.
    // Tuned for nomic-embed-text cosine similarity. Adjust after evaluation.
    private static final double MINIMUM_SCORE_THRESHOLD = 0.65;

    // Soft target: prefer at least this many chunks before trusting retrieval.
    // A single chunk may be an accidental match.
    private static final int MINIMUM_CHUNK_COUNT = 2;

    private final VectorStore vectorStore;

    public RagRetrievalGate(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    /**
     * Attempt retrieval. Return a RetrievalResult that callers MUST inspect.
     *
     * @param query      The user's question (or transformed query).
     * @param topK       How many chunks to request from the vector store.
     * @return           RetrievalResult — always check hasData() before proceeding.
     */
    public RetrievalResult retrieve(String query, int topK) {
        List<Document> candidates = vectorStore.similaritySearch(
                SearchRequest.query(query)
                        .withTopK(topK)
                        .withSimilarityThreshold(MINIMUM_SCORE_THRESHOLD)
        );

        if (candidates.isEmpty()) {
            return RetrievalResult.noData(query, "Vector store returned zero results above threshold " + MINIMUM_SCORE_THRESHOLD);
        }

        if (candidates.size() < MINIMUM_CHUNK_COUNT) {
            // Only one chunk found — marginal confidence, still block
            return RetrievalResult.lowConfidence(query, candidates,
                    "Only " + candidates.size() + " chunk(s) found — below minimum required " + MINIMUM_CHUNK_COUNT);
        }

        // Compute average score to detect cases where all chunks are borderline
        double avgScore = candidates.stream()
                .mapToDouble(doc -> {
                    Object score = doc.getMetadata().get("distance");
                    return score instanceof Number n ? n.doubleValue() : MINIMUM_SCORE_THRESHOLD;
                })
                .average()
                .orElse(0.0);

        if (avgScore < MINIMUM_SCORE_THRESHOLD + 0.05) {
            // All chunks are borderline — treat as low confidence
            return RetrievalResult.lowConfidence(query, candidates,
                    String.format("Average similarity score %.3f is too low (need > %.3f)", avgScore, MINIMUM_SCORE_THRESHOLD + 0.05));
        }

        return RetrievalResult.found(query, candidates);
    }

    // ── Result type ───────────────────────────────────────────────────────────

    public record RetrievalResult(
            String query,
            List<Document> documents,
            RetrievalStatus status,
            String reason
    ) {
        public boolean hasData() {
            return status == RetrievalStatus.FOUND;
        }

        public boolean isLowConfidence() {
            return status == RetrievalStatus.LOW_CONFIDENCE;
        }

        static RetrievalResult found(String query, List<Document> docs) {
            return new RetrievalResult(query, docs, RetrievalStatus.FOUND, null);
        }

        static RetrievalResult noData(String query, String reason) {
            return new RetrievalResult(query, List.of(), RetrievalStatus.NO_DATA, reason);
        }

        static RetrievalResult lowConfidence(String query, List<Document> docs, String reason) {
            return new RetrievalResult(query, docs, RetrievalStatus.LOW_CONFIDENCE, reason);
        }
    }

    public enum RetrievalStatus {
        FOUND,           // Good data found — safe to call LLM with context
        LOW_CONFIDENCE,  // Some data found but weak — call LLM with heavy caution prompt
        NO_DATA          // Nothing found — DO NOT call LLM at all
    }
}
```

#### [IMPLEMENT] Updated NaiveRagService.java — Gate Applied

```java
// FILE: mousike/src/main/java/com/example/mousike/rag/NaiveRagService.java
package com.example.mousike.rag;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.document.Document;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.stream.Collectors;

@Service
public class NaiveRagService {

    private static final Logger log = LoggerFactory.getLogger(NaiveRagService.class);

    // Returned verbatim when retrieval finds nothing.
    // The LLM is NOT called in this path — this is a pure Java string return.
    static final String NO_DATA_RESPONSE =
            "I don't have information about that in my knowledge base. " +
            "The documents I have access to don't contain relevant content for your question. " +
            "Please check that the relevant documents have been ingested, or rephrase your question.";

    static final String LOW_CONFIDENCE_RESPONSE_PREFIX =
            "I found some potentially related information, but my confidence is low. " +
            "Please verify this independently:\n\n";

    private final ChatClient chatClient;
    private final RagRetrievalGate retrievalGate;

    public NaiveRagService(
            @Qualifier("ragChatClient") ChatClient chatClient,
            RagRetrievalGate retrievalGate) {
        this.chatClient = chatClient;
        this.retrievalGate = retrievalGate;
    }

    public RagResponse query(String question) {
        // ── LAYER 1: Retrieval Gate ───────────────────────────────────────────
        var retrieval = retrievalGate.retrieve(question, 5);

        if (!retrieval.hasData() && !retrieval.isLowConfidence()) {
            // NO DATA: return safe response, DO NOT call LLM
            log.warn("RAG gate blocked LLM call — no data for query: '{}' reason: {}",
                    question, retrieval.reason());
            return RagResponse.noData(question, NO_DATA_RESPONSE);
        }

        // Build context string from retrieved chunks
        String context = retrieval.documents().stream()
                .map(Document::getText)
                .collect(Collectors.joining("\n\n---\n\n"));

        // ── LAYER 2: System prompt enforces non-hallucination ─────────────────
        // (The prompt template is defined in Section 21.4 below)
        String systemPrompt = retrieval.isLowConfidence()
                ? buildLowConfidenceSystemPrompt(context)
                : buildStrictSystemPrompt(context);

        // ── Call LLM only when we have data ───────────────────────────────────
        String answer = chatClient.prompt()
                .system(systemPrompt)
                .user(question)
                .call()
                .content();

        // ── LAYER 3: Output Validator ─────────────────────────────────────────
        // (Described in Section 21.5 below)
        var validated = RagOutputValidator.validate(answer, retrieval.documents());
        if (!validated.isGrounded()) {
            log.warn("Output validator rejected answer for query: '{}' reason: {}",
                    question, validated.reason());
            return RagResponse.ungrounded(question, NO_DATA_RESPONSE, validated.reason());
        }

        return RagResponse.success(question, answer, retrieval.documents().size(),
                retrieval.isLowConfidence());
    }

    private String buildStrictSystemPrompt(String context) {
        return """
                You are Mousike, a music assistant. Answer the user's question using ONLY
                the context below. This is a hard requirement.

                CONTEXT:
                %s

                RULES — follow ALL of them strictly:
                1. Answer ONLY using information explicitly present in the CONTEXT above.
                2. If the CONTEXT does not contain the answer, respond with exactly:
                   "I don't have information about that in my knowledge base."
                   Do NOT attempt to answer from general knowledge.
                3. Do NOT speculate, infer, or extrapolate beyond what the CONTEXT states.
                4. Do NOT use phrases like "I believe", "I think", "probably", or "likely"
                   when referring to facts — state only what the CONTEXT confirms.
                5. If the CONTEXT is partially relevant, answer only the parts it covers
                   and explicitly state which parts you cannot answer.
                6. Cite the source document name when possible (use metadata: source field).
                """.formatted(context);
    }

    private String buildLowConfidenceSystemPrompt(String context) {
        return """
                You are Mousike, a music assistant. The retrieval system found limited
                relevant information. Answer with EXTRA caution.

                CONTEXT (low confidence match):
                %s

                STRICT RULES:
                1. Answer ONLY using information explicitly present in the CONTEXT.
                2. Start your answer with: "Based on limited available information: "
                3. If even the low-confidence context does not answer the question,
                   respond with: "I don't have reliable information about that topic."
                4. Do NOT use your training knowledge to fill gaps.
                5. Recommend the user verify the answer from authoritative sources.
                """.formatted(context);
    }

    // ── Response envelope ────────────────────────────────────────────────────

    public record RagResponse(
            String question,
            String answer,
            int chunksUsed,
            boolean isGrounded,
            boolean isLowConfidence,
            String debugReason   // null in production; populated for NO_DATA/UNGROUNDED
    ) {
        static RagResponse success(String q, String a, int chunks, boolean lowConf) {
            return new RagResponse(q, a, chunks, true, lowConf, null);
        }
        static RagResponse noData(String q, String a) {
            return new RagResponse(q, a, 0, false, false, "NO_DATA");
        }
        static RagResponse ungrounded(String q, String a, String reason) {
            return new RagResponse(q, a, 0, false, false, reason);
        }
    }
}
```

---

### 21.4 Layer 2 — System Prompt Contract

Every system prompt used in a RAG context MUST include all of the following
instructions, in this exact order. Claude agent: copy these verbatim into every
`systemPrompt` string in `NaiveRagService`, `AdvancedRagService`, `AgenticRagService`,
and in all `prompts/*.st` template files.

```
# ANTI-HALLUCINATION SYSTEM PROMPT CONTRACT
# Include ALL of these rules in every RAG system prompt — no exceptions.

RULE 1 — CONTEXT ONLY:
Answer exclusively from the CONTEXT provided below.
Never use your training knowledge to answer factual questions.

RULE 2 — EXPLICIT REFUSAL:
If the CONTEXT does not contain enough information to answer the question,
respond with this exact phrase:
  "I don't have information about that in my knowledge base."
Do not apologise. Do not elaborate. Do not attempt a partial answer from memory.

RULE 3 — NO INFERENCE:
Do not infer, extrapolate, or guess facts that are not explicitly stated in the CONTEXT.
Example of what is FORBIDDEN:
  Question: "When was Beethoven born?"
  Context: [no birth year mentioned]
  FORBIDDEN answer: "Beethoven was likely born around 1770..."
  CORRECT answer: "I don't have information about that in my knowledge base."

RULE 4 — PARTIAL ANSWERS:
If the CONTEXT answers part of the question but not all of it:
  - Answer the parts the CONTEXT supports.
  - For unsupported parts, say: "The available documents don't cover [specific aspect]."

RULE 5 — NO FABRICATED SOURCES:
Do not cite, invent, or reference document titles, page numbers, or authors
unless they are explicitly present in the CONTEXT metadata.

RULE 6 — CONFIDENCE SIGNALLING:
If a fact in the CONTEXT is ambiguous or contradicted by another chunk:
  - Present both versions.
  - Do not pick one without evidence.
  - Say: "The sources provide conflicting information on this point."
```

#### [IMPLEMENT] Prompt Template Files

```
# FILE: mousike/src/main/resources/prompts/system-rag.st
# Strict RAG system prompt — used by NaiveRagService and AdvancedRagService

You are Mousike, an AI assistant for music knowledge.

CONTEXT FROM KNOWLEDGE BASE:
{context}

ANTI-HALLUCINATION RULES — YOU MUST FOLLOW ALL OF THESE:

1. Answer ONLY using information explicitly present in the CONTEXT above.
   Never use your training knowledge to answer factual questions.

2. If the CONTEXT does not contain the answer, respond with EXACTLY:
   "I don't have information about that in my knowledge base."

3. Do not infer, speculate, or extrapolate beyond what the CONTEXT states.

4. If the CONTEXT partially answers the question, answer the supported parts
   and state: "The available documents don't cover [the remaining aspect]."

5. Do not cite, reference, or invent document sources not present in the CONTEXT.

6. If you are uncertain whether the CONTEXT supports a claim, do not make the claim.
```

```
# FILE: mousike/src/main/resources/prompts/system-rag-agentic.st
# Agentic RAG system prompt — used by AgenticRagService (MCP tools)

You are Mousike, an AI assistant for music knowledge.
You have access to tools that search a music knowledge base.

ANTI-HALLUCINATION RULES — MANDATORY:

1. ALWAYS call the searchMusicKnowledge tool before answering any factual question.
   Do NOT answer from your training knowledge without first checking the knowledge base.

2. If the tool returns "No relevant music knowledge found", respond with EXACTLY:
   "I don't have information about that in my knowledge base."
   Do NOT attempt to answer from your own training data.

3. If the tool returns results, base your answer EXCLUSIVELY on those results.
   Quote or paraphrase from the tool output. Do not add training knowledge.

4. If multiple tool calls return conflicting information, present both versions
   and note the conflict. Do not resolve the conflict using training knowledge.

5. Never fabricate document names, composers, dates, or musical facts.
   If the tools don't confirm a fact, do not state it.

TOOL USAGE PROTOCOL:
- Call searchMusicKnowledge for broad questions.
- Call searchByCategory when the category is known (composers/instruments/theory/history).
- Call listAvailableDocuments first if unsure whether the topic is in the knowledge base.
```

---

### 21.5 Layer 3 — Output Validator (Post-Generation Check)

After the LLM generates an answer, a lightweight validator checks whether the
answer is grounded in the retrieved chunks. This catches cases where the model
ignores the system prompt rules and answers from training knowledge.

#### [IMPLEMENT] RagOutputValidator.java

```java
// FILE: mousike/src/main/java/com/example/mousike/rag/RagOutputValidator.java
package com.example.mousike.rag;

import org.springframework.ai.document.Document;

import java.util.List;
import java.util.Locale;

/**
 * ANTI-HALLUCINATION LAYER 3: Output Validator.
 *
 * Lightweight post-generation check. Detects common hallucination patterns
 * in the LLM's answer and flags answers that appear ungrounded.
 *
 * This is a heuristic validator — it catches obvious failures.
 * For deeper evaluation (faithfulness, relevance scoring), use Phoenix
 * evaluations via the Arize Evals API.
 */
public final class RagOutputValidator {

    private RagOutputValidator() {}

    // Phrases that signal the model ignored context and answered from training knowledge
    private static final List<String> HALLUCINATION_SIGNALS = List.of(
            "as an ai language model",
            "based on my training",
            "from my knowledge",
            "i was trained on",
            "i know that",
            "it is well known that",
            "generally speaking",
            "in general,",
            "typically,",
            "as we know,",
            "of course,"
    );

    // Phrases that mean the model correctly refused (grounded refusal = valid output)
    private static final List<String> VALID_REFUSAL_PHRASES = List.of(
            "i don't have information about that in my knowledge base",
            "the available documents don't cover",
            "no relevant music knowledge found",
            "i don't have reliable information"
    );

    /**
     * Validate that the LLM answer is grounded in the retrieved documents.
     *
     * @param answer     The LLM-generated answer text.
     * @param documents  The retrieved documents that were injected as context.
     * @return           ValidationResult — check isGrounded() before using the answer.
     */
    public static ValidationResult validate(String answer, List<Document> documents) {
        if (answer == null || answer.isBlank()) {
            return ValidationResult.fail("LLM returned empty answer");
        }

        String lowerAnswer = answer.toLowerCase(Locale.ROOT);

        // A valid refusal is always grounded — the model correctly said "I don't know"
        for (String refusal : VALID_REFUSAL_PHRASES) {
            if (lowerAnswer.contains(refusal)) {
                return ValidationResult.pass("Valid refusal — model correctly indicated no data");
            }
        }

        // Detect hallucination signal phrases
        for (String signal : HALLUCINATION_SIGNALS) {
            if (lowerAnswer.contains(signal)) {
                return ValidationResult.fail(
                        "Hallucination signal detected in answer: '" + signal + "'. " +
                        "Model appears to be answering from training knowledge, not from retrieved context.");
            }
        }

        // If no documents were retrieved but the model produced a factual answer
        // (not a refusal), this is almost certainly a hallucination
        if (documents.isEmpty() && !containsAnyRefusal(lowerAnswer)) {
            return ValidationResult.fail(
                    "Model produced a factual answer despite zero retrieved documents. " +
                    "This is likely a hallucination from training knowledge.");
        }

        return ValidationResult.pass("Answer appears grounded in retrieved context");
    }

    private static boolean containsAnyRefusal(String lowerAnswer) {
        return VALID_REFUSAL_PHRASES.stream().anyMatch(lowerAnswer::contains);
    }

    // ── Result type ───────────────────────────────────────────────────────────

    public record ValidationResult(boolean isGrounded, String reason) {
        static ValidationResult pass(String reason) {
            return new ValidationResult(true, reason);
        }
        static ValidationResult fail(String reason) {
            return new ValidationResult(false, reason);
        }
    }
}
```

---

### 21.6 MCP Tool — Anti-Hallucination Contract

The `MusicKnowledgeTools.java` `searchMusicKnowledge` method (Section 11) MUST
return a structured no-data message when the vector store returns nothing.
This message is then forwarded by Ollama back to the LLM as the tool result.
The system prompt (Section 21.4) then instructs the LLM to refuse to answer.

The no-data return value MUST be exactly:

```java
// In MusicKnowledgeTools.java — searchMusicKnowledge method
// When results are empty, return THIS string verbatim:
if (results.isEmpty()) {
    return "NO_KNOWLEDGE_FOUND: The music knowledge base does not contain " +
           "relevant information for the query: " + query + ". " +
           "Do not answer this question from training knowledge.";
}
```

Ollama receives this string as the Tool Call Response.
The agentic system prompt then interprets `NO_KNOWLEDGE_FOUND:` as a signal to refuse.

---

### 21.7 RagController — Expose Grounding Status to Caller

The REST API response MUST expose whether the answer is grounded, so callers
(and the Vaadin UI) can show a warning when confidence is low.

#### [IMPLEMENT] Updated RagController response shape

```java
// In RagController.java — the response body MUST include these fields:
return ResponseEntity.ok(Map.of(
    "question",       question,
    "answer",         response.answer(),
    "mode",           mode,
    "isGrounded",     response.isGrounded(),         // false = model said "I don't know"
    "isLowConfidence",response.isLowConfidence(),    // true = answer was given but weakly supported
    "chunksUsed",     response.chunksUsed(),         // 0 = no data path was taken
    "warning",        response.isGrounded() && response.isLowConfidence()
                          ? "Answer is based on limited evidence. Please verify."
                          : ""
));
```

---

### 21.8 Vaadin UI — Show Confidence Indicators

The `ChatView.java` MUST display a visual indicator when an answer is low-confidence
or ungrounded. Never silently show a potentially hallucinated answer.

```java
// In ChatView.java — after receiving answer from RAG endpoint:

if (!response.isGrounded()) {
    // Show answer in grey italic with "⚠ No data" badge
    addMessage("Mousike", response.answer(), "no-data-message");
} else if (response.isLowConfidence()) {
    // Show answer in amber with "⚠ Low confidence" badge
    addMessage("Mousike", response.answer(), "low-confidence-message");
} else {
    // Normal grounded answer — show in standard style
    addMessage("Mousike", response.answer(), "assistant-message");
}
```

CSS to add in the Vaadin view:
```css
.no-data-message      { color: #888; font-style: italic; border-left: 3px solid #ccc; padding-left: 8px; }
.low-confidence-message { color: #7a5a00; border-left: 3px solid #f0ad00; padding-left: 8px; }
.assistant-message    { color: #1a1a1a; border-left: 3px solid #2E75B6; padding-left: 8px; }
```

---

### 21.9 Testing Anti-Hallucination Behaviour

Every RAG service test MUST include at minimum these three test cases:

```java
// FILE: mousike/src/test/java/com/example/mousike/rag/AntiHallucinationTest.java
package com.example.mousike.rag;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class AntiHallucinationTest {

    // ── Test 1: Empty vector store → NO LLM call, safe refusal ───────────────
    @Test
    void whenVectorStoreIsEmpty_thenReturnNoDataResponse_notLlmAnswer() {
        // Arrange: mock VectorStore returns empty list
        // Act: call NaiveRagService.query("Who wrote Symphony No. 5?")
        // Assert:
        //   response.isGrounded() == false
        //   response.chunksUsed() == 0
        //   response.answer() contains "I don't have information about that"
        //   ChatClient.prompt() was NEVER called (verify with Mockito.verify(chatClient, never()))
    }

    // ── Test 2: Low-score results → LLM called with caution prompt ───────────
    @Test
    void whenVectorStoreReturnsBelowThreshold_thenMarkLowConfidence() {
        // Arrange: mock VectorStore returns 1 doc with score 0.61 (below 0.65 threshold)
        // Act: call NaiveRagService.query(...)
        // Assert:
        //   response.isLowConfidence() == true
        //   response.answer() starts with "Based on limited available information"
    }

    // ── Test 3: Output validator catches hallucination signal ─────────────────
    @Test
    void whenLlmAnswerContainsHallucinationSignal_thenValidatorRejects() {
        // Arrange: mock ChatClient returns "Based on my training, Beethoven was born in 1770"
        //          mock VectorStore returns 3 documents (passes gate)
        // Act: call NaiveRagService.query(...)
        // Assert:
        //   RagOutputValidator rejects the answer
        //   Final response.isGrounded() == false
        //   Final response.answer() == NaiveRagService.NO_DATA_RESPONSE
    }

    // ── Test 4: Valid refusal is accepted ─────────────────────────────────────
    @Test
    void whenLlmCorrectlyRefuses_thenValidatorAcceptsRefusal() {
        // Arrange: mock ChatClient returns
        //          "I don't have information about that in my knowledge base."
        // Act: call output validator directly
        // Assert:
        //   ValidationResult.isGrounded() == true
        //   (A correct refusal IS a grounded response)
    }

    // ── Test 5: MCP tool no-data propagation ──────────────────────────────────
    @Test
    void whenMcpToolReturnsNoKnowledgeFound_thenAgenticServiceRefuses() {
        // Arrange: mock MCP tool returns "NO_KNOWLEDGE_FOUND: ..."
        //          mock Ollama response references the NO_KNOWLEDGE_FOUND signal
        // Act: call AgenticRagService.query(conversationId, question)
        // Assert: final answer does not contain factual claims about the topic
    }
}
```

---

### 21.10 Summary Table — What the Agent Must Implement

| Location | Anti-Hallucination Requirement | Status |
|---|---|---|
| `RagRetrievalGate.java` | Block LLM call when score < 0.65 or chunks < 2 | `[IMPLEMENT]` |
| `NaiveRagService.java` | Call gate first; return NO_DATA_RESPONSE if blocked | `[IMPLEMENT]` |
| `AdvancedRagService.java` | Call gate first; same NO_DATA contract | `[IMPLEMENT]` |
| `AgenticRagService.java` | System prompt enforces tool-first rule | `[IMPLEMENT]` |
| `RagOutputValidator.java` | Reject answers with hallucination signal phrases | `[IMPLEMENT]` |
| `MusicKnowledgeTools.java` | Return `NO_KNOWLEDGE_FOUND:` string when empty | `[IMPLEMENT]` |
| `prompts/system-rag.st` | All 6 rules from Section 21.4 present verbatim | `[IMPLEMENT]` |
| `prompts/system-rag-agentic.st` | Tool-first protocol + refusal instructions | `[IMPLEMENT]` |
| `RagController.java` | Expose `isGrounded`, `isLowConfidence`, `chunksUsed` | `[IMPLEMENT]` |
| `ChatView.java` | Visual warning for low-confidence / no-data answers | `[IMPLEMENT]` |
| `AntiHallucinationTest.java` | 5 test cases covering all failure modes | `[IMPLEMENT]` |

---

## APPENDIX: Key Decisions Reference

| Decision | Choice | Reason |
|---|---|---|
| MCP transport | HTTP + SSE | Default for Spring AI; works well in Kubernetes; no separate WebSocket infra |
| Embedding model | `nomic-embed-text` (768 dims) | Best quality/size ratio; available in Ollama; well-supported by pgvector HNSW |
| Chat model | `llama3.2` (default) | Small, fast, good quality; user can swap via `SPRING_AI_OLLAMA_CHAT_MODEL` env var |
| Vector index | HNSW | Faster query than IVFFlat for small-medium datasets; pgvector supports it |
| Chunk size | 1000 tokens / 200 overlap | Conservative; fits in nomic-embed-text's window; adjust per document type |
| Chat memory TTL | 2 hours | Reasonable for demo; user sessions clear after 2h of inactivity |
| OTel sampling | 100% | For development; reduce to 10% in staging/production |
| Docling cache | emptyDir (replace with PVC) | emptyDir fine for Kind demo; use PVC for persistent deployments |
| `imagePullPolicy` | `Never` | Required for Kind with locally loaded images |
| Multi-module Gradle | Yes | Separate `mousike` and `document-service` → separate OCI images |

---

*END OF SPEC — Last updated: March 2026*
*Source: ThomasVitale/concerto-for-java-and-ai + ThomasVitale/modular-rag + MCP diagram slide*
*Architecture constraint: NO arconia dependencies anywhere in the codebase*
