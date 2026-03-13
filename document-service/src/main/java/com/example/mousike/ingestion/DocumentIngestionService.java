package com.example.mousike.ingestion;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.reader.tika.TikaDocumentReader;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class DocumentIngestionService {

    private static final Logger log = LoggerFactory.getLogger(DocumentIngestionService.class);

    @Value("${spring.ai.docling.base-url:http://localhost:5001}")
    private String doclingBaseUrl;

    private final VectorStore vectorStore;

    private final TokenTextSplitter textSplitter = new TokenTextSplitter();

    public DocumentIngestionService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    public IngestionResult ingest(Resource resource, String category) {
        log.info("Starting ingestion: file={} category={}", resource.getFilename(), category);

        try {
            var reader = new TikaDocumentReader(resource);
            List<Document> rawDocs = reader.get();
            log.info("Parsed {} documents from {}", rawDocs.size(), resource.getFilename());

            List<Document> enrichedDocs = rawDocs.stream()
                    .map(doc -> {
                        doc.getMetadata().put("source", resource.getFilename());
                        doc.getMetadata().put("category", category);
                        doc.getMetadata().put("ingested_at", System.currentTimeMillis());
                        return doc;
                    })
                    .toList();

            List<Document> chunks = textSplitter.apply(enrichedDocs);
            log.info("Split into {} chunks", chunks.size());

            vectorStore.accept(chunks);
            log.info("Ingestion complete: {} chunks stored in PGVector", chunks.size());

            return new IngestionResult(resource.getFilename(), chunks.size(), true, null);

        } catch (Exception e) {
            log.error("Ingestion failed for {}: {}", resource.getFilename(), e.getMessage(), e);
            return new IngestionResult(resource.getFilename(), 0, false, e.getMessage());
        }
    }

    public record IngestionResult(String filename, int chunksIngested, boolean success, String errorMessage) {}
}
