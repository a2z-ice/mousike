package com.example.mousike.ingestion;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.core.io.InputStreamResource;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class IngestionController {

    private final DocumentIngestionService ingestionService;

    public IngestionController(DocumentIngestionService ingestionService) {
        this.ingestionService = ingestionService;
    }

    @PostMapping("/ingest")
    public ResponseEntity<Map<String, Object>> ingest(
            @RequestParam("file") MultipartFile file,
            @RequestParam(defaultValue = "general") String category) throws IOException {

        var resource = new InputStreamResource(file.getInputStream()) {
            @Override
            public String getFilename() {
                return file.getOriginalFilename();
            }
        };

        var result = ingestionService.ingest(resource, category);

        return ResponseEntity.ok(Map.of(
                "filename", result.filename() != null ? result.filename() : "unknown",
                "chunksIngested", result.chunksIngested(),
                "success", result.success(),
                "error", result.errorMessage() != null ? result.errorMessage() : ""
        ));
    }

    @GetMapping("/documents")
    public ResponseEntity<Map<String, String>> listDocuments() {
        return ResponseEntity.ok(Map.of(
                "status", "available",
                "info", "Document metadata endpoint"
        ));
    }
}
