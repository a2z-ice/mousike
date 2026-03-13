# Mousike — Visual Diagrams

Interactive, animated HTML diagrams for the Mousike platform. Open any `.html` file in a browser to see the animated data flows.

## Diagrams

| # | Diagram | Description |
|---|---------|-------------|
| 01 | [Architecture Overview](01-architecture-overview.html) | Full system architecture with animated data flow between all services |
| 02 | [RAG Pipeline Flow](02-rag-pipeline-flow.html) | Interactive 3-mode RAG pipeline (Naive / Advanced / Agentic) with guardrail animations |
| 03 | [Request Lifecycle](03-request-lifecycle.html) | Animated sequence diagram: chat message through all components with trace timeline |
| 04 | [Kubernetes Topology](04-kubernetes-topology.html) | K8s cluster layout with all 7 pods, services, port mappings, and health indicators |
| 05 | [Observability & Tracing](05-observability-trace-flow.html) | Dual OTLP export to Phoenix + Grafana with animated trace span visualization |
| 06 | [Document Ingestion](06-document-ingestion-pipeline.html) | Step-by-step pipeline: PDF → Tika → Splitter → Embedding → PGVector |
| 07 | [MCP Communication](07-mcp-communication.html) | MCP client-server SSE protocol with tool call sequence diagram |

## How to View

```bash
# Open in default browser
open docs/diagrams/01-architecture-overview.html

# Or serve locally
cd docs/diagrams && python3 -m http.server 8000
# Then visit http://localhost:8000
```

## Design

- Dark theme matching GitHub's color palette
- CSS-only animations (no JavaScript dependencies except tab switching)
- SVG-based for crisp rendering at any resolution
- Self-contained HTML files (no external dependencies)
