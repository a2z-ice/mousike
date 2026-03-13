package com.example.mousike.repository;

import com.example.mousike.domain.Composer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ComposerRepository extends JpaRepository<Composer, Long> {
    List<Composer> findByNameContainingIgnoreCase(String name);
    List<Composer> findByEra(String era);
}
