package com.example.mousike.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "document_metadata")
public class DocumentMetadata {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String filename;

    private String category;
    private int chunkCount;
    private Instant ingestedAt;

    @Column(length = 1000)
    private String status;

    public DocumentMetadata() {}

    public DocumentMetadata(String filename, String category, int chunkCount) {
        this.filename = filename;
        this.category = category;
        this.chunkCount = chunkCount;
        this.ingestedAt = Instant.now();
        this.status = "COMPLETED";
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getFilename() { return filename; }
    public void setFilename(String filename) { this.filename = filename; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public int getChunkCount() { return chunkCount; }
    public void setChunkCount(int chunkCount) { this.chunkCount = chunkCount; }
    public Instant getIngestedAt() { return ingestedAt; }
    public void setIngestedAt(Instant ingestedAt) { this.ingestedAt = ingestedAt; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
