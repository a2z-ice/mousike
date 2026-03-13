package com.example.mousike.rag;

import com.example.mousike.guardrails.OutputValidator;
import com.example.mousike.guardrails.RagRetrievalGate;
import com.example.mousike.guardrails.RetrievalResult;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.vectorstore.QuestionAnswerAdvisor;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.stereotype.Service;

@Service
public class AdvancedRagService {

    private final ChatClient chatClient;
    private final RagRetrievalGate retrievalGate;
    private final OutputValidator outputValidator;

    public AdvancedRagService(ChatModel chatModel, VectorStore vectorStore,
                              RagRetrievalGate retrievalGate, OutputValidator outputValidator) {
        this.retrievalGate = retrievalGate;
        this.outputValidator = outputValidator;

        var advisor = QuestionAnswerAdvisor.builder(vectorStore)
                .searchRequest(SearchRequest.builder()
                        .similarityThreshold(0.65)
                        .topK(10)
                        .build())
                .build();

        this.chatClient = ChatClient.builder(chatModel)
                .defaultSystem("""
                        You are Mousike. Answer based ONLY on the retrieved context.
                        If context is insufficient, say so. Cite sources.
                        """)
                .defaultAdvisors(advisor)
                .build();
    }

    public String query(String question) {
        var retrieval = retrievalGate.retrieve(question, 10);
        if (!retrieval.hasData()) {
            return RetrievalResult.NO_DATA_RESPONSE;
        }

        String answer = chatClient.prompt()
                .user(question)
                .call()
                .content();

        var validation = outputValidator.validate(answer, retrieval.documents());
        if (!validation.valid()) {
            return RetrievalResult.NO_DATA_RESPONSE;
        }

        return answer;
    }
}
