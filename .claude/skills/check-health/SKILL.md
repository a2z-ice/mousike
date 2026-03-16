---
name: check-health
description: Quick health check of all Mousike stack components — pods, services, endpoints, and metrics
---

Run a comprehensive health check of the entire Mousike stack.

## Steps

1. Check all Kubernetes pods:
```bash
kubectl get pods -n rag
```
All pods should show `1/1 Running`.

2. Check application health endpoints:
```bash
echo "=== Mousike App ==="
curl -sf http://localhost:8080/actuator/health | python3 -m json.tool

echo "=== Document Service ==="
curl -sf http://localhost:8091/actuator/health | python3 -m json.tool
```
Both should return `{"status":"UP"}` with `db` component UP.

3. Check Ollama:
```bash
echo "=== Ollama ==="
curl -sf http://localhost:11434/api/tags | python3 -c "
import sys, json
data = json.load(sys.stdin)
models = [m['name'] for m in data.get('models', [])]
print(f'Models: {models}')
required = {'llama3.2', 'nomic-embed-text'}
missing = required - {m.split(':')[0] for m in models}
if missing: print(f'MISSING: {missing}')
else: print('All required models present')
"
```

4. Check observability:
```bash
echo "=== Phoenix ==="
curl -sf http://localhost:6006/healthz && echo " OK" || echo " FAIL"

echo "=== Grafana ==="
curl -sf http://localhost:3000/api/health | python3 -m json.tool
```

5. Check vector store:
```bash
echo "=== Vector Store ==="
kubectl exec postgres-0 -n rag -- psql -U mousike -c "SELECT count(*) as vectors FROM vector_store;" 2>/dev/null
```

6. Quick API smoke test:
```bash
echo "=== API Smoke Test ==="
curl -sf "http://localhost:8080/api/search?q=test&topK=1" --max-time 10 && echo " Search OK" || echo " Search FAIL"
```

Report the results. Flag any component that is not healthy.
