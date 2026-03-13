package com.example.mousike.rag;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

@Service
public class AgenticRagService {

    private static final String CONVERSATION_ID_KEY = "chat_memory_conversation_id";

    private final ChatClient agenticChatClient;
    private final ChatMemory chatMemory;

    public AgenticRagService(
            @Qualifier("agenticChatClient") ChatClient agenticChatClient,
            ChatMemory chatMemory) {
        this.agenticChatClient = agenticChatClient;
        this.chatMemory = chatMemory;
    }

    public String query(String conversationId, String question) {
        return agenticChatClient.prompt()
                .user(question)
                .advisors(advisor -> advisor.param(CONVERSATION_ID_KEY, conversationId))
                .call()
                .content();
    }
}
