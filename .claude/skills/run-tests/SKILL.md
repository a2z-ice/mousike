---
name: run-tests
description: Run tests — unit tests (Gradle), E2E tests (Playwright API/UI), or sanity checks against the running cluster
disable-model-invocation: true
argument-hint: <unit|e2e|api|ui|sanity|all> [test-filter]
---

Run the specified test suite for the Mousike project.

Test type: $0
Filter (optional): $1

## Test Types

### unit — Gradle Unit Tests
```bash
# All unit tests
./gradlew test

# Specific test class
./gradlew :mousike:test --tests "com.example.mousike.rag.NaiveRagServiceTest"

# Specific module
./gradlew :mousike:test
./gradlew :document-service:test
```
If a filter is provided, use it as `--tests "$1"`.

### e2e — All Playwright E2E Tests
```bash
cd e2e && npx playwright test
```
Requires the Kind cluster to be running with all services healthy.

### api — Playwright API Tests Only
```bash
cd e2e && npx playwright test --project=api
```

### ui — Playwright UI Tests Only
```bash
cd e2e && npx playwright test --project=ui
```

### sanity — Quick Health Checks
```bash
echo "=== Health Checks ==="
curl -sf http://localhost:8080/actuator/health | python3 -m json.tool
curl -sf http://localhost:8091/actuator/health | python3 -m json.tool
curl -sf http://localhost:11434/api/tags | python3 -m json.tool

echo "=== Pod Status ==="
kubectl get pods -n rag

echo "=== Quick API Test ==="
curl -sf -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Say hello in one word"}' --max-time 30
```

### all — Run Everything
Run unit tests first, then E2E tests.

## Playwright Configuration

- Timeout: 120 seconds per test
- Retries: 1
- Projects: `api`, `ui`, `full-stack`

## After Test Failures

Show the Playwright HTML report:
```bash
cd e2e && npx playwright show-report
```
