---
name: ingest-documents
description: Ingest documents into the PGVector store via the document-service API or Kubernetes job
disable-model-invocation: true
argument-hint: <api|job> [file-path]
---

Ingest documents into the vector store.

Method: $0
File (for API method): $1

## Method: api — Upload via REST API

Upload a file to the document-service ingestion endpoint:

```bash
curl -X POST http://localhost:8091/api/ingest \
  -F "file=@$1" \
  -F "category=general"
```

Expected success response:
```json
{
  "filename": "document.pdf",
  "chunksIngested": 42,
  "success": true,
  "error": ""
}
```

Expected failure response:
```json
{
  "filename": "document.pdf",
  "chunksIngested": 0,
  "success": false,
  "error": "java.io.IOException: ..."
}
```

Supported formats: PDF, DOCX (parsed by Apache Tika).
Max file size: 50MB.

## Method: job — Run Kubernetes Ingestion Job

The ingestion job processes documents bundled in the document-service classpath:

```bash
# Delete previous job if exists
kubectl delete job ingester -n rag 2>/dev/null

# Create new job
kubectl apply -f k8s/ingester/job.yaml

# Watch progress
kubectl logs -f -l job-name=ingester -n rag

# Verify completion
kubectl get jobs -n rag
```

The job runs with `--spring.profiles.active=ingestion,k8s` and has `backoffLimit: 3`.

## Verify Ingestion

```bash
# Count vectors in store
kubectl exec postgres-0 -n rag -- psql -U mousike -c "SELECT count(*) FROM vector_store;"

# Check categories
kubectl exec postgres-0 -n rag -- psql -U mousike -c \
  "SELECT metadata->>'category' as cat, count(*) FROM vector_store GROUP BY cat;"

# Test search
curl -s "http://localhost:8080/api/search?q=test&topK=3" | python3 -m json.tool
```

## Pipeline

File → TikaDocumentReader → Category Metadata → TokenTextSplitter → Ollama Embedding (nomic-embed-text, 768 dims) → PGVector (HNSW index, COSINE_DISTANCE)
