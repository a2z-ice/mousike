plugins {
    id("org.springframework.boot")
    id("io.spring.dependency-management")
    id("com.vaadin") version "25.0.5"
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

    // Spring AI — Ollama (Chat + Embedding)
    implementation("org.springframework.ai:spring-ai-starter-model-ollama")

    // Spring AI — Vector Store (PGVector)
    implementation("org.springframework.ai:spring-ai-starter-vector-store-pgvector")

    // Spring AI — RAG Advisors
    implementation("org.springframework.ai:spring-ai-advisors-vector-store")

    // Spring AI — Chat Memory (JDBC)
    implementation("org.springframework.ai:spring-ai-starter-model-chat-memory-repository-jdbc")

    // Spring AI — MCP Client
    implementation("org.springframework.ai:spring-ai-starter-mcp-client")

    // Vaadin UI
    implementation("com.vaadin:vaadin-spring-boot-starter:25.0.5")

    // Observability — OpenTelemetry
    implementation("org.springframework.boot:spring-boot-starter-opentelemetry")
    implementation("io.micrometer:micrometer-tracing-bridge-otel")
    implementation("io.opentelemetry:opentelemetry-exporter-otlp")
    runtimeOnly("io.micrometer:micrometer-registry-prometheus")
    implementation("io.opentelemetry.instrumentation:opentelemetry-logback-appender-1.0:2.12.0-alpha")

    // Testing
    testImplementation("org.springframework.boot:spring-boot-starter-test")
}
