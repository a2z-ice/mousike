---
name: take-screenshots
description: Capture screenshots of all running Mousike views and services using Playwright
disable-model-invocation: true
---

Capture screenshots of all running application views and services.

## Command

```bash
cd e2e && npx tsx take-screenshots.ts
```

## What It Captures

| Screenshot | URL | Output |
|---|---|---|
| Chat View | http://localhost:8080/chat | `screenshots/chat-view.png` |
| Search View | http://localhost:8080/search | `screenshots/search-view.png` |
| Composer View | http://localhost:8080/composer | `screenshots/composer-view.png` |
| Monitor View | http://localhost:8080/monitor | `screenshots/monitor-view.png` |
| Phoenix UI | http://localhost:6006 | `screenshots/phoenix-ui.png` |
| Grafana UI | http://localhost:3000 | `screenshots/grafana-ui.png` |
| Actuator Health | http://localhost:8080/actuator/health | `screenshots/actuator-health.png` |
| Ollama Models | http://localhost:11434/api/tags | `screenshots/ollama-models.png` |

Screenshots are saved to `docs/diagrams/screenshots/` and used in the comprehensive guide.

## Capture OG Banner

To regenerate the LinkedIn/social media banner:
```bash
cd e2e && npx tsx capture-banner.ts
```
Output: `docs/diagrams/og-banner.png` (2400x1260 retina)

## Prerequisites

- Kind cluster running with all services healthy
- Playwright browsers installed: `cd e2e && npx playwright install chromium`
