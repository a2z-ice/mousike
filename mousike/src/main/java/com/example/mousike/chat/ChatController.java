package com.example.mousike.chat;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    @PostMapping
    public ResponseEntity<Map<String, String>> chat(@RequestBody Map<String, String> request) {
        String message = request.get("message");
        String conversationId = request.getOrDefault("conversationId", UUID.randomUUID().toString());

        if (message == null || message.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "message is required"));
        }

        String response = chatService.chatSync(conversationId, message);
        return ResponseEntity.ok(Map.of(
                "response", response,
                "conversationId", conversationId
        ));
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> chatStream(@RequestBody Map<String, String> request) {
        String message = request.getOrDefault("message", "");
        String conversationId = request.getOrDefault("conversationId", UUID.randomUUID().toString());
        return chatService.chat(conversationId, message);
    }

    @DeleteMapping("/{conversationId}")
    public ResponseEntity<Void> clearHistory(@PathVariable String conversationId) {
        chatService.clearHistory(conversationId);
        return ResponseEntity.noContent().build();
    }
}
