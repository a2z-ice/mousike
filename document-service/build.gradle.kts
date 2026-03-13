plugins {
    id("org.springframework.boot")
    id("io.spring.dependency-management")
    java
}

dependencyManagement {
    imports {
        mavenBom("org.springframework.ai:spring-ai-bom:2.0.0-M2")
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

    // Spring AI — PGVector
    implementation("org.springframework.ai:spring-ai-starter-vector-store-pgvector")

    // Spring AI — Tika Document Reader (for PDF/DOCX parsing)
    implementation("org.springframework.ai:spring-ai-tika-document-reader")

    // Spring AI — MCP Server (HTTP+SSE)
    implementation("org.springframework.ai:spring-ai-starter-mcp-server-webmvc")

    // Observability
    implementation("io.micrometer:micrometer-tracing-bridge-otel")
    implementation("io.opentelemetry:opentelemetry-exporter-otlp")
    runtimeOnly("io.micrometer:micrometer-registry-prometheus")

    // Testing
    testImplementation("org.springframework.boot:spring-boot-starter-test")
}
