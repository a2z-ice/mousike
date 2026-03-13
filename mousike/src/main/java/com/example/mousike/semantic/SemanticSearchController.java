package com.example.mousike.semantic;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/search")
public class SemanticSearchController {

    private final SemanticSearchService searchService;

    public SemanticSearchController(SemanticSearchService searchService) {
        this.searchService = searchService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> search(
            @RequestParam String q,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "5") int topK) {
        return ResponseEntity.ok(searchService.search(q, category, topK));
    }
}
