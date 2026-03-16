---
name: start-stack
description: Start the entire Mousike stack — Docker Desktop, Ollama, Kind cluster, infrastructure, applications, and sanity tests
disable-model-invocation: true
argument-hint: [--skip-build] [--skip-tests] [--yes]
---

Start the entire Mousike stack using the start script.

## Usage

Run `./scripts/start-stack.sh` with the provided arguments: $ARGUMENTS

If no arguments provided, run with defaults (full build + tests).

## Available Flags

- `--skip-build` — Reuse existing Docker images (skip Gradle build)
- `--skip-tests` — Skip the 15-point sanity test suite
- `--yes` or `-y` — Non-interactive mode (auto-accept all prompts)

## What the Script Does (6 Phases)

1. **Prerequisites**: Checks Docker Desktop, Ollama, models (llama3.2, nomic-embed-text), kind, kubectl, gradlew
2. **Kind Cluster**: Creates `mousike-cluster` with port mappings from `k8s/kind-config.yaml`
3. **Configuration**: Applies ConfigMap (`rag-config`) and Secret (`rag-secrets`)
4. **Infrastructure**: Deploys PostgreSQL, Redis, Docling, Phoenix, Grafana LGTM — waits for all to be ready
5. **Applications**: Builds images via `bootBuildImage`, loads into Kind, deploys mousike + document-service
6. **Sanity Tests**: 15 checks covering health, DB, Prometheus, Ollama models, Phoenix, Grafana, K8s pods, API endpoints

## Expected Result

All 7 pods running in namespace `rag`, 15/15 sanity tests passing:
- Mousike App: http://localhost:8080
- Document Service: http://localhost:8091
- Phoenix: http://localhost:6006
- Grafana: http://localhost:3000
- Ollama: http://localhost:11434

## Troubleshooting

If the script fails, check:
1. Docker Desktop running: `docker info`
2. Ollama running: `curl http://localhost:11434/api/tags`
3. Pod status: `kubectl get pods -n rag`
4. Pod logs: `kubectl logs <pod-name> -n rag`
