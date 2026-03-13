package com.example.mousike.rag;

import com.example.mousike.guardrails.OutputValidator;
import com.example.mousike.guardrails.RagRetrievalGate;
import com.example.mousike.guardrails.RetrievalResult;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

@Service
public class NaiveRagService {

    private final ChatClient chatClient;
    private final RagRetrievalGate retrievalGate;
    private final OutputValidator outputValidator;

    public NaiveRagService(
            @Qualifier("ragChatClient") ChatClient chatClient,
            RagRetrievalGate retrievalGate,
            OutputValidator outputValidator) {
        this.chatClient = chatClient;
        this.retrievalGate = retrievalGate;
        this.outputValidator = outputValidator;
    }

    public String query(String question) {
        // Layer 1: Retrieval Gate
        var retrieval = retrievalGate.retrieve(question, 5);
        if (!retrieval.hasData()) {
            return RetrievalResult.NO_DATA_RESPONSE;
        }

        // Layer 2: System prompt already instructs LLM to refuse if context is weak
        String answer = chatClient.prompt()
                .user(question)
                .call()
                .content();

        // Layer 3: Output validation
        var validation = outputValidator.validate(answer, retrieval.documents());
        if (!validation.valid()) {
            return RetrievalResult.NO_DATA_RESPONSE;
        }

        return answer;
    }
}
