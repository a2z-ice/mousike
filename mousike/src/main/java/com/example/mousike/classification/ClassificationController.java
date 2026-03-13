package com.example.mousike.classification;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/classify")
public class ClassificationController {

    private final InstrumentClassifier classifier;

    public ClassificationController(InstrumentClassifier classifier) {
        this.classifier = classifier;
    }

    @PostMapping
    public ResponseEntity<Map<String, String>> classify(@RequestBody Map<String, String> request) {
        String description = request.get("description");
        if (description == null || description.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "description is required"));
        }
        String result = classifier.classify(description);
        return ResponseEntity.ok(Map.of("classification", result));
    }
}
