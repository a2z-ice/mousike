package com.example.mousike.config;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.exporter.otlp.http.trace.OtlpHttpSpanExporter;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.export.SpanExporter;
import io.opentelemetry.semconv.ServiceAttributes;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class ObservabilityConfig {

    @Value("${PHOENIX_OTLP_HTTP_URL:http://localhost:6006}")
    private String phoenixOtlpUrl;

    @Value("${GRAFANA_OTLP_HTTP_URL:http://localhost:4318}")
    private String grafanaOtlpUrl;

    @Bean
    public SpanExporter phoenixSpanExporter() {
        return OtlpHttpSpanExporter.builder()
                .setEndpoint(phoenixOtlpUrl + "/v1/traces")
                .setTimeout(Duration.ofSeconds(10))
                .build();
    }

    @Bean
    public SpanExporter grafanaSpanExporter() {
        return OtlpHttpSpanExporter.builder()
                .setEndpoint(grafanaOtlpUrl + "/v1/traces")
                .setTimeout(Duration.ofSeconds(10))
                .build();
    }

    @Bean
    public Resource otelResource() {
        return Resource.getDefault().merge(
                Resource.create(Attributes.of(
                        ServiceAttributes.SERVICE_NAME, "mousike",
                        ServiceAttributes.SERVICE_VERSION, "1.0.0",
                        AttributeKey.stringKey("deployment.environment"), "local-kind"
                ))
        );
    }
}
