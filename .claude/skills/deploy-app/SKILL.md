---
name: deploy-app
description: Rebuild and redeploy a specific application (mousike or document-service) to the Kind cluster without restarting infrastructure
disable-model-invocation: true
argument-hint: <mousike|document-service|both>
---

Rebuild and redeploy the specified application to the running Kind cluster.

Target: $ARGUMENTS (must be `mousike`, `document-service`, or `both`)

## Steps for Each Target

### mousike
```bash
./gradlew :mousike:bootBuildImage --imageName=mousike-app:latest -Pvaadin.productionMode=true
kind load docker-image mousike-app:latest --name mousike-cluster
kubectl rollout restart deployment/mousike -n rag
kubectl rollout status deployment/mousike -n rag --timeout=180s
```

### document-service
```bash
./gradlew :document-service:bootBuildImage --imageName=document-service:latest
kind load docker-image document-service:latest --name mousike-cluster
kubectl rollout restart deployment/document-service -n rag
kubectl rollout status deployment/document-service -n rag --timeout=180s
```

### both
Run both sequences above.

## Post-Deploy Verification

After deployment, verify health:
```bash
curl -s http://localhost:8080/actuator/health | python3 -m json.tool
curl -s http://localhost:8091/actuator/health | python3 -m json.tool
```

## Prerequisites

- Kind cluster `mousike-cluster` must be running
- Infrastructure pods (postgres, redis, etc.) must be healthy
- Docker Desktop must be running
