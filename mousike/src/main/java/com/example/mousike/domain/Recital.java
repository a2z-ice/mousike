package com.example.mousike.domain;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "recitals")
public class Recital {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    private String venue;
    private LocalDate date;

    @Column(length = 2000)
    private String program;

    @ManyToOne
    @JoinColumn(name = "composer_id")
    private Composer composer;

    public Recital() {}

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getVenue() { return venue; }
    public void setVenue(String venue) { this.venue = venue; }
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }
    public String getProgram() { return program; }
    public void setProgram(String program) { this.program = program; }
    public Composer getComposer() { return composer; }
    public void setComposer(Composer composer) { this.composer = composer; }
}
