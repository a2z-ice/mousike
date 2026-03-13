package com.example.mousike.ingestion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
@Profile("ingestion")
public class IngestionStartupRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(IngestionStartupRunner.class);

    private final DocumentIngestionService ingestionService;

    public IngestionStartupRunner(DocumentIngestionService ingestionService) {
        this.ingestionService = ingestionService;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("=== Starting bulk document ingestion ===");

        var documents = new String[][]{
                {"docs/music-theory.pdf", "theory"},
                {"docs/composers-biographies.pdf", "composers"},
                {"docs/instruments-encyclopedia.pdf", "instruments"},
                {"docs/jazz-history.pdf", "history"},
        };

        int totalChunks = 0;
        for (String[] doc : documents) {
            var resource = new ClassPathResource(doc[0]);
            if (resource.exists()) {
                var result = ingestionService.ingest(resource, doc[1]);
                if (result.success()) {
                    totalChunks += result.chunksIngested();
                    log.info("{} -> {} chunks", doc[0], result.chunksIngested());
                } else {
                    log.error("{} -> FAILED: {}", doc[0], result.errorMessage());
                }
            } else {
                log.warn("Skipping {} - resource not found on classpath", doc[0]);
            }
        }

        log.info("=== Ingestion complete: {} total chunks stored ===", totalChunks);
    }
}
