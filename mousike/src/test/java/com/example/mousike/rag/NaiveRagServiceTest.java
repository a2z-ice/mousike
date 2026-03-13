package com.example.mousike.rag;

import com.example.mousike.guardrails.OutputValidator;
import com.example.mousike.guardrails.RagRetrievalGate;
import com.example.mousike.guardrails.RetrievalResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.document.Document;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NaiveRagServiceTest {

    @Mock private ChatClient chatClient;
    @Mock private RagRetrievalGate retrievalGate;
    @Mock private OutputValidator outputValidator;
    @Mock private ChatClient.ChatClientRequestSpec requestSpec;
    @Mock private ChatClient.CallResponseSpec callResponseSpec;

    private NaiveRagService naiveRagService;

    @BeforeEach
    void setUp() {
        naiveRagService = new NaiveRagService(chatClient, retrievalGate, outputValidator);
    }

    @Test
    void shouldReturnNoDataResponseWhenRetrievalGateBlocks() {
        when(retrievalGate.retrieve(anyString(), anyInt()))
                .thenReturn(RetrievalResult.noData("test query", "no results"));

        String result = naiveRagService.query("unknown topic");

        assertThat(result).isEqualTo(RetrievalResult.NO_DATA_RESPONSE);
    }

    @Test
    void shouldReturnAnswerWhenRetrievalSucceeds() {
        var docs = List.of(new Document("Bach was a German composer."),
                           new Document("He was born in Eisenach in 1685."));
        var retrieval = RetrievalResult.withData("Bach biography", docs);

        when(retrievalGate.retrieve(anyString(), anyInt())).thenReturn(retrieval);
        when(chatClient.prompt()).thenReturn(requestSpec);
        when(requestSpec.user(anyString())).thenReturn(requestSpec);
        when(requestSpec.call()).thenReturn(callResponseSpec);
        when(callResponseSpec.content()).thenReturn("Bach was a German composer born in 1685.");
        when(outputValidator.validate(anyString(), anyList()))
                .thenReturn(new OutputValidator.ValidationResult(true, "grounded"));

        String result = naiveRagService.query("Tell me about Bach");

        assertThat(result).contains("Bach");
    }
}
