package com.example.mousike.chat;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

@Service
public class ChatService {

    private static final String CONVERSATION_ID_KEY = "chat_memory_conversation_id";

    private final ChatClient chatClient;
    private final ChatMemory chatMemory;

    public ChatService(ChatClient chatClient, ChatMemory chatMemory) {
        this.chatClient = chatClient;
        this.chatMemory = chatMemory;
    }

    public Flux<String> chat(String conversationId, String userMessage) {
        return chatClient.prompt()
                .user(userMessage)
                .advisors(advisor -> advisor.param(CONVERSATION_ID_KEY, conversationId))
                .stream()
                .content();
    }

    public String chatSync(String conversationId, String userMessage) {
        return chatClient.prompt()
                .user(userMessage)
                .advisors(advisor -> advisor.param(CONVERSATION_ID_KEY, conversationId))
                .call()
                .content();
    }

    public void clearHistory(String conversationId) {
        chatMemory.clear(conversationId);
    }
}
