package com.giwon.blog.core.series.infrastructure.persistence

import com.giwon.blog.core.series.domain.Series
import com.giwon.blog.core.series.domain.SeriesReader
import org.springframework.stereotype.Component

@Component
class JpaSeriesReader(
    private val seriesJpaRepository: SeriesJpaRepository,
) : SeriesReader {

    override fun findById(id: Long): Series? {
        return seriesJpaRepository.findById(id).orElse(null)
    }

    override fun findBySlug(slug: String): Series? {
        return seriesJpaRepository.findBySlug(slug)
    }

    override fun findAll(): List<Series> {
        return seriesJpaRepository.findAll()
    }

    override fun existsBySlug(slug: String): Boolean {
        return seriesJpaRepository.existsBySlug(slug)
    }
}
