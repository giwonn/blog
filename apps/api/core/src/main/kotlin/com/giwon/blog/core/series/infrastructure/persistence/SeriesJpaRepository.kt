package com.giwon.blog.core.series.infrastructure.persistence

import com.giwon.blog.core.series.domain.Series
import org.springframework.data.jpa.repository.JpaRepository

interface SeriesJpaRepository : JpaRepository<Series, Long> {
    fun findBySlug(slug: String): Series?
    fun existsBySlug(slug: String): Boolean
}
