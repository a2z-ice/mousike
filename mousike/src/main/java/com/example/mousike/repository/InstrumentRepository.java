package com.example.mousike.repository;

import com.example.mousike.domain.Instrument;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InstrumentRepository extends JpaRepository<Instrument, Long> {
    List<Instrument> findByCategory(String category);
    List<Instrument> findByNameContainingIgnoreCase(String name);
}
