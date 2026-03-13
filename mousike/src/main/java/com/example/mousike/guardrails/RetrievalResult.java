package com.example.mousike.guardrails;

import org.springframework.ai.document.Document;

import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

public record RetrievalResult(
        String query,
        List<Document> documents,
        boolean hasData,
        boolean lowConfidence,
        String reason
) {
    public static RetrievalResult noData(String query, String reason) {
        return new RetrievalResult(query, Collections.emptyList(), false, false, reason);
    }

    public static RetrievalResult lowConfidence(String query, List<Document> docs, String reason) {
        return new RetrievalResult(query, docs, false, true, reason);
    }

    public static RetrievalResult withData(String query, List<Document> docs) {
        return new RetrievalResult(query, docs, true, false, null);
    }

    public String contextText() {
        return documents.stream()
                .map(doc -> {
                    var source = doc.getMetadata().getOrDefault("source", "unknown");
                    return String.format("[Source: %s]\n%s", source, doc.getText());
                })
                .collect(Collectors.joining("\n\n---\n\n"));
    }

    public static final String NO_DATA_RESPONSE =
            "I don't have enough information in my knowledge base to answer that question accurately. " +
            "Please try rephrasing your question or ask about a different music topic.";
}
