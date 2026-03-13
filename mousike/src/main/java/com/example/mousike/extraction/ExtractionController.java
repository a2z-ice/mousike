package com.example.mousike.extraction;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/extract")
public class ExtractionController {

    private final ComposerExtractor extractor;

    public ExtractionController(ComposerExtractor extractor) {
        this.extractor = extractor;
    }

    @PostMapping
    public ResponseEntity<Map<String, String>> extract(@RequestBody Map<String, String> request) {
        String text = request.get("text");
        if (text == null || text.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "text is required"));
        }
        String result = extractor.extract(text);
        return ResponseEntity.ok(Map.of("extraction", result));
    }
}
