package com.example.mousike.guardrails;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class RagRetrievalGate {

    private static final double MINIMUM_SCORE_THRESHOLD = 0.65;
    private static final int MINIMUM_CHUNK_COUNT = 2;

    private final VectorStore vectorStore;

    public RagRetrievalGate(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    public RetrievalResult retrieve(String query, int topK) {
        List<Document> candidates = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query(query)
                        .topK(topK)
                        .similarityThreshold(MINIMUM_SCORE_THRESHOLD)
                        .build()
        );

        if (candidates.isEmpty()) {
            return RetrievalResult.noData(query, "No results above threshold " + MINIMUM_SCORE_THRESHOLD);
        }

        if (candidates.size() < MINIMUM_CHUNK_COUNT) {
            return RetrievalResult.lowConfidence(query, candidates,
                    "Only " + candidates.size() + " chunk(s) found, minimum is " + MINIMUM_CHUNK_COUNT);
        }

        return RetrievalResult.withData(query, candidates);
    }
}
