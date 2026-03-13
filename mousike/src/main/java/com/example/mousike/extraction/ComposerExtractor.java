package com.example.mousike.extraction;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.stereotype.Service;

@Service
public class ComposerExtractor {

    private final ChatClient extractorClient;

    public ComposerExtractor(ChatModel chatModel) {
        this.extractorClient = ChatClient.builder(chatModel)
                .defaultSystem("""
                        You are a music data extraction expert.
                        Given text about a composer, extract structured information.
                        Respond with ONLY a JSON object:
                        {
                          "name": "Full Name",
                          "birthYear": 1700,
                          "deathYear": 1770,
                          "nationality": "Country",
                          "era": "Musical Era",
                          "notableWorks": ["Work 1", "Work 2"],
                          "instruments": ["Instrument 1"]
                        }
                        If a field is unknown, use null.
                        """)
                .build();
    }

    public String extract(String text) {
        return extractorClient.prompt()
                .user(text)
                .call()
                .content();
    }
}
