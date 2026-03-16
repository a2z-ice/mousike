---
name: stop-stack
description: Stop the Mousike stack — delete Kind cluster, optionally clean images, caches, and stop Docker/Ollama
disable-model-invocation: true
argument-hint: [--clean] [--yes]
---

Stop the Mousike stack using the stop script.

Run `./scripts/stop-stack.sh` with the provided arguments: $ARGUMENTS

## Available Flags

- `--clean` — Full cleanup: delete cluster + remove Docker images + prune build cache + optionally stop Docker/Ollama
- `--yes` or `-y` — Non-interactive mode (auto-accept all prompts)
- (no flags) — Default: delete Kind cluster only, keep images and services

## Default Mode (no --clean)

Deletes the Kind cluster `mousike-cluster`. Docker images and build caches are kept for fast restart with `--skip-build`.

## Clean Mode (--clean)

5-phase cleanup:
1. Delete Kind cluster
2. Remove Docker images (mousike-app, document-service, dangling images)
3. Clean Gradle build caches (`./gradlew clean`, node_modules)
4. Prune Docker build cache (buildpack layers)
5. Optionally stop Ollama and Docker Desktop

## After Stopping

- Quick restart: `./scripts/start-stack.sh --skip-build`
- Full restart: `./scripts/start-stack.sh`
