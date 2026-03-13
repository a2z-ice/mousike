package com.example.mousike.rag;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/rag")
public class RagController {

    private final NaiveRagService naiveRagService;
    private final AdvancedRagService advancedRagService;
    private final AgenticRagService agenticRagService;

    public RagController(NaiveRagService naiveRagService,
                         AdvancedRagService advancedRagService,
                         AgenticRagService agenticRagService) {
        this.naiveRagService = naiveRagService;
        this.advancedRagService = advancedRagService;
        this.agenticRagService = agenticRagService;
    }

    @PostMapping("/query")
    public ResponseEntity<Map<String, String>> query(
            @RequestParam(defaultValue = "advanced") String mode,
            @RequestParam(required = false, defaultValue = "default") String conversationId,
            @RequestBody Map<String, String> request) {

        String question = request.get("question");
        if (question == null || question.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "question is required"));
        }

        String answer = switch (mode) {
            case "naive" -> naiveRagService.query(question);
            case "agentic" -> agenticRagService.query(conversationId, question);
            default -> advancedRagService.query(question);
        };

        return ResponseEntity.ok(Map.of(
                "question", question,
                "answer", answer,
                "mode", mode
        ));
    }
}
