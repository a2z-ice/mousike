package com.example.mousike.semantic;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class SemanticSearchService {

    private final VectorStore vectorStore;

    public SemanticSearchService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    public List<Map<String, Object>> search(String query, String category, int topK) {
        var requestBuilder = SearchRequest.builder()
                .query(query)
                .topK(topK > 0 ? topK : 5)
                .similarityThreshold(0.6);

        if (category != null && !category.isBlank()) {
            var filter = new FilterExpressionBuilder().eq("category", category).build();
            requestBuilder.filterExpression(filter);
        }

        List<Document> results = vectorStore.similaritySearch(requestBuilder.build());

        return results.stream()
                .map(doc -> Map.<String, Object>of(
                        "content", doc.getText(),
                        "metadata", doc.getMetadata()
                ))
                .collect(Collectors.toList());
    }
}
