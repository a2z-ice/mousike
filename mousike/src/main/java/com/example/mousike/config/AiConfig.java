package com.example.mousike.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.client.advisor.vectorstore.QuestionAnswerAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.memory.repository.jdbc.JdbcChatMemoryRepository;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

@Configuration
public class AiConfig {

    @Bean
    public JdbcChatMemoryRepository chatMemoryRepository(DataSource dataSource) {
        return JdbcChatMemoryRepository.builder()
                .dataSource(dataSource)
                .build();
    }

    @Bean
    public ChatMemory chatMemory(JdbcChatMemoryRepository chatMemoryRepository) {
        return MessageWindowChatMemory.builder()
                .chatMemoryRepository(chatMemoryRepository)
                .maxMessages(20)
                .build();
    }

    @Bean
    public ChatClient chatClient(ChatModel chatModel, ChatMemory chatMemory) {
        return ChatClient.builder(chatModel)
                .defaultSystem("""
                        You are Mousike, an AI assistant specialized in music, composers,
                        instruments, and music history. You answer questions thoughtfully,
                        citing sources when available.
                        When you don't know something, say so rather than guessing.
                        """)
                .defaultAdvisors(
                        MessageChatMemoryAdvisor.builder(chatMemory).build()
                )
                .build();
    }

    @Bean("ragChatClient")
    public ChatClient ragChatClient(ChatModel chatModel, VectorStore vectorStore, ChatMemory chatMemory) {
        return ChatClient.builder(chatModel)
                .defaultSystem("""
                        You are Mousike, an AI assistant for music.
                        Answer ONLY based on the provided context. If the context does not
                        contain enough information, say "I don't have enough information about that."
                        Do NOT hallucinate facts. Cite your sources by referencing document metadata.
                        """)
                .defaultAdvisors(
                        MessageChatMemoryAdvisor.builder(chatMemory).build(),
                        QuestionAnswerAdvisor.builder(vectorStore)
                                .searchRequest(SearchRequest.builder()
                                        .similarityThreshold(0.50)
                                        .topK(5)
                                        .build())
                                .build()
                )
                .build();
    }
}
