package com.example.mousike.classification;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.stereotype.Service;

@Service
public class InstrumentClassifier {

    private final ChatClient classifierClient;

    public InstrumentClassifier(ChatModel chatModel) {
        this.classifierClient = ChatClient.builder(chatModel)
                .defaultSystem("""
                        You are a music instrument classification expert.
                        Given a description of a musical instrument, classify it into one of these categories:
                        STRING, WOODWIND, BRASS, PERCUSSION, KEYBOARD, ELECTRONIC, VOCAL.
                        Respond with ONLY a JSON object: {"category": "CATEGORY", "confidence": 0.0-1.0, "reasoning": "brief explanation"}
                        """)
                .build();
    }

    public String classify(String description) {
        return classifierClient.prompt()
                .user(description)
                .call()
                .content();
    }
}
