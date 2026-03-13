package com.example.mousike.config;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.exporter.otlp.trace.OtlpGrpcSpanExporter;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.semconv.ServiceAttributes;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
public class ObservabilityConfig {

    @Value("${PHOENIX_OTLP_GRPC_URL:http://localhost:4317}")
    private String phoenixOtlpUrl;

    @Bean
    public OtlpGrpcSpanExporter phoenixSpanExporter() {
        return OtlpGrpcSpanExporter.builder()
                .setEndpoint(phoenixOtlpUrl)
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
