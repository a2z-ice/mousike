package com.example.mousike.tools;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MusicKnowledgeToolsTest {

    @Mock
    private VectorStore vectorStore;

    private MusicKnowledgeTools tools;

    @BeforeEach
    void setUp() {
        tools = new MusicKnowledgeTools(vectorStore);
    }

    @Test
    void searchMusicKnowledgeShouldReturnFormattedResults() {
        var doc = new Document("Bach was born in 1685", Map.of("source", "composers.pdf"));
        when(vectorStore.similaritySearch(any(SearchRequest.class)))
                .thenReturn(List.of(doc));

        String result = tools.searchMusicKnowledge("Bach biography", 5, 0.65);

        assertThat(result).contains("Bach was born in 1685");
        assertThat(result).contains("composers.pdf");
    }

    @Test
    void searchMusicKnowledgeShouldReturnNoResultsMessage() {
        when(vectorStore.similaritySearch(any(SearchRequest.class)))
                .thenReturn(List.of());

        String result = tools.searchMusicKnowledge("quantum physics", 5, 0.65);

        assertThat(result).contains("No relevant music knowledge found");
    }

    @Test
    void listAvailableDocumentsShouldReturnSources() {
        String result = tools.listAvailableDocuments();

        assertThat(result).contains("music-theory.pdf");
        assertThat(result).contains("composers-biographies.pdf");
    }
}
