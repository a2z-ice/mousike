package com.example.mousike.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "composers")
public class Composer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    private Integer birthYear;
    private Integer deathYear;
    private String nationality;
    private String era;

    @Column(length = 4000)
    private String biography;

    public Composer() {}

    public Composer(String name, String nationality, String era) {
        this.name = name;
        this.nationality = nationality;
        this.era = era;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Integer getBirthYear() { return birthYear; }
    public void setBirthYear(Integer birthYear) { this.birthYear = birthYear; }
    public Integer getDeathYear() { return deathYear; }
    public void setDeathYear(Integer deathYear) { this.deathYear = deathYear; }
    public String getNationality() { return nationality; }
    public void setNationality(String nationality) { this.nationality = nationality; }
    public String getEra() { return era; }
    public void setEra(String era) { this.era = era; }
    public String getBiography() { return biography; }
    public void setBiography(String biography) { this.biography = biography; }
}
