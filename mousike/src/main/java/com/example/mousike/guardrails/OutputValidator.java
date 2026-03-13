package com.example.mousike.guardrails;

import org.springframework.ai.document.Document;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class OutputValidator {

    public ValidationResult validate(String llmResponse, List<Document> retrievedChunks) {
        if (llmResponse == null || llmResponse.isBlank()) {
            return new ValidationResult(false, "Empty response from LLM");
        }

        if (retrievedChunks == null || retrievedChunks.isEmpty()) {
            return new ValidationResult(false, "No retrieved chunks to validate against");
        }

        // Check if the response is a refusal (which is valid)
        String lower = llmResponse.toLowerCase();
        if (lower.contains("i don't have enough information") ||
            lower.contains("i don't know") ||
            lower.contains("not enough information") ||
            lower.contains("cannot find")) {
            return new ValidationResult(true, "Valid refusal response");
        }

        // Basic grounding check: at least some content overlap between response and chunks
        String allChunkText = retrievedChunks.stream()
                .map(Document::getText)
                .reduce("", (a, b) -> a + " " + b)
                .toLowerCase();

        String[] responseWords = llmResponse.toLowerCase().split("\\s+");
        long contentWords = 0;
        long groundedWords = 0;

        for (String word : responseWords) {
            if (word.length() > 4) { // Skip short/common words
                contentWords++;
                if (allChunkText.contains(word)) {
                    groundedWords++;
                }
            }
        }

        if (contentWords == 0) {
            return new ValidationResult(true, "Response has no significant content words");
        }

        double groundingRatio = (double) groundedWords / contentWords;
        if (groundingRatio < 0.3) {
            return new ValidationResult(false,
                    String.format("Low grounding ratio: %.2f (threshold: 0.30)", groundingRatio));
        }

        return new ValidationResult(true, String.format("Grounding ratio: %.2f", groundingRatio));
    }

    public record ValidationResult(boolean valid, String reason) {}
}
