package com.example.mousike.tools;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.stream.Collectors;

@Component
public class MusicKnowledgeTools {

    private static final Logger log = LoggerFactory.getLogger(MusicKnowledgeTools.class);

    private final VectorStore vectorStore;

    public MusicKnowledgeTools(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    @Tool(
        name = "searchMusicKnowledge",
        description = """
            Search the music knowledge base for information about composers, instruments,
            music theory, music history, or any music-related topic.
            Use this tool when the user asks about music facts, composer biographies,
            instrument characteristics, or historical events in music.
            """
    )
    public String searchMusicKnowledge(
            @ToolParam(description = "The search query. Be specific and descriptive.") String query,
            @ToolParam(description = "Maximum number of results to return. Default: 5") int topK,
            @ToolParam(description = "Minimum similarity score (0.0-1.0). Default: 0.65") double minScore
    ) {
        log.info("MCP Tool called: searchMusicKnowledge query='{}' topK={} minScore={}", query, topK, minScore);

        List<Document> results = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query(query)
                        .topK(topK > 0 ? topK : 5)
                        .similarityThreshold(minScore > 0 ? minScore : 0.65)
                        .build()
        );

        if (results.isEmpty()) {
            return "No relevant music knowledge found for query: " + query;
        }

        return results.stream()
                .map(doc -> {
                    var source = doc.getMetadata().getOrDefault("source", "unknown");
                    var score = doc.getMetadata().getOrDefault("distance", "N/A");
                    return String.format("[Source: %s, Score: %s]\n%s", source, score, doc.getText());
                })
                .collect(Collectors.joining("\n\n---\n\n"));
    }

    @Tool(
        name = "searchByCategory",
        description = """
            Search the music knowledge base filtered by category.
            Categories: composers, instruments, theory, history, genres, techniques.
            Use when you need information from a specific domain of music knowledge.
            """
    )
    public String searchByCategory(
            @ToolParam(description = "The search query") String query,
            @ToolParam(description = "Category to filter by: composers, instruments, theory, history, genres, techniques") String category
    ) {
        log.info("MCP Tool called: searchByCategory query='{}' category='{}'", query, category);

        var filterBuilder = new FilterExpressionBuilder();
        var filterExpression = filterBuilder.eq("category", category).build();

        List<Document> results = vectorStore.similaritySearch(
                SearchRequest.builder()
                        .query(query)
                        .topK(5)
                        .similarityThreshold(0.6)
                        .filterExpression(filterExpression)
                        .build()
        );

        if (results.isEmpty()) {
            return String.format("No results found for '%s' in category '%s'", query, category);
        }

        return results.stream()
                .map(doc -> String.format("[%s] %s",
                        doc.getMetadata().getOrDefault("title", "Untitled"),
                        doc.getText()))
                .collect(Collectors.joining("\n\n"));
    }

    @Tool(
        name = "listAvailableDocuments",
        description = "List the documents available in the music knowledge base. Use this to understand what sources are available before searching."
    )
    public String listAvailableDocuments() {
        return """
            Available knowledge sources:
            - music-theory.pdf: Comprehensive music theory guide (scales, chords, harmony)
            - composers-biographies.pdf: Major classical composers (Bach, Mozart, Beethoven, etc.)
            - instruments-encyclopedia.pdf: Encyclopedia of musical instruments
            - jazz-history.pdf: History of jazz and notable artists
            - contemporary-music.pdf: 20th and 21st century music movements
            """;
    }
}
