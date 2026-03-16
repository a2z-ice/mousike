---
name: troubleshoot
description: Diagnose and fix issues with the Mousike stack — pods, services, LLM, MCP, RAG, database, observability
argument-hint: [component]
---

Troubleshoot the Mousike stack. Target component: $ARGUMENTS

## Quick Diagnostic (Run First)

```bash
# Pod status
kubectl get pods -n rag

# App health
curl -s http://localhost:8080/actuator/health | python3 -m json.tool

# Document service health
curl -s http://localhost:8091/actuator/health | python3 -m json.tool

# Ollama status
curl -s http://localhost:11434/api/tags | python3 -m json.tool

# Phoenix
curl -s http://localhost:6006/healthz

# Grafana
curl -s http://localhost:3000/api/health
```

## Component-Specific Diagnostics

### pods / kubernetes
```bash
kubectl get pods -n rag
kubectl describe pod <pod-name> -n rag
kubectl logs <pod-name> -n rag
kubectl logs <pod-name> -n rag --previous  # After crash
```
Common issues: Init:0/2 (dependency not ready), CrashLoopBackOff (app crash), ImagePullBackOff (image not loaded into Kind)

### ollama / llm
```bash
curl -s http://localhost:11434/api/tags  # List models
ollama list                              # Verify models
# Required: llama3.2, nomic-embed-text
# If missing: ollama pull llama3.2 && ollama pull nomic-embed-text
```

### mcp
```bash
# Test MCP endpoint from host
curl -s http://localhost:8091/actuator/health

# Test from inside mousike pod
kubectl exec -it <mousike-pod> -n rag -- curl -s http://document-service:8090/actuator/health

# Check MCP SSE endpoint
curl -N -H "Accept: text/event-stream" http://localhost:8091/mcp/sse

# MCP timeout is 30s (spring.ai.mcp.client.request-timeout)
```

### rag / guardrails
```bash
# Test RAG with in-domain question
curl -s -X POST "http://localhost:8080/api/rag/query?mode=naive" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is a symphony?"}' | python3 -m json.tool

# Test guardrails with out-of-domain question (should be blocked)
curl -s -X POST "http://localhost:8080/api/rag/query?mode=naive" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is the population of Tokyo?"}' | python3 -m json.tool

# Check vector store has documents
kubectl exec postgres-0 -n rag -- psql -U mousike -c "SELECT count(*) FROM vector_store;"
```

### database / postgresql
```bash
kubectl exec postgres-0 -n rag -- pg_isready -U mousike -d mousike
kubectl exec postgres-0 -n rag -- psql -U mousike -c "SELECT extname FROM pg_extension;"
kubectl exec postgres-0 -n rag -- psql -U mousike -c "SELECT count(*) FROM vector_store;"
kubectl exec postgres-0 -n rag -- psql -U mousike -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
```

### chat / memory
```bash
# Test chat memory
CONV_ID=$(uuidgen)
curl -s -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"My name is TestBot\", \"conversationId\":\"$CONV_ID\"}" | python3 -m json.tool

curl -s -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"What is my name?\", \"conversationId\":\"$CONV_ID\"}" | python3 -m json.tool

# Check memory table
kubectl exec postgres-0 -n rag -- psql -U mousike -c \
  "SELECT conversation_id, count(*) FROM ai_chat_memory GROUP BY conversation_id;"
```

### observability / traces / metrics
```bash
# Prometheus metrics
curl -s http://localhost:8080/actuator/prometheus | grep gen_ai_client
curl -s http://localhost:8080/actuator/prometheus | grep hikaricp

# Check OTLP env vars
kubectl exec -it <mousike-pod> -n rag -- env | grep -E "PHOENIX|GRAFANA|OTLP"
```

### ports
```bash
# Verify Kind port mappings
docker port mousike-cluster-control-plane

# Check what's listening
lsof -i :8080
lsof -i :8091
lsof -i :3000
lsof -i :6006
lsof -i :11434
```

## Reference

Full troubleshooting guide: `docs/diagrams/troubleshooting-guide.html`
