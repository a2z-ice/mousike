package com.example.mousike.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.mcp.SyncMcpToolCallbackProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class McpClientConfig {

    @Bean("agenticChatClient")
    public ChatClient agenticChatClient(
            ChatModel chatModel,
            ChatMemory chatMemory,
            SyncMcpToolCallbackProvider mcpToolCallbackProvider
    ) {
        return ChatClient.builder(chatModel)
                .defaultSystem("""
                        You are Mousike, an AI assistant for music. You have access to a music
                        knowledge base through tools. Use the tools to find accurate information
                        before answering. Always cite your sources.
                        Available tools: searchMusicKnowledge, searchByCategory, listAvailableDocuments.
                        """)
                .defaultToolCallbacks(mcpToolCallbackProvider)
                .build();
    }
}
