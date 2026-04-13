package com.giwon.blog.core.series.infrastructure.persistence

import com.giwon.blog.core.series.domain.Series
import com.giwon.blog.core.series.domain.SeriesWriter
import org.springframework.stereotype.Component

@Component
class JpaSeriesWriter(
    private val seriesJpaRepository: SeriesJpaRepository,
) : SeriesWriter {

    override fun save(series: Series): Series {
        return seriesJpaRepository.save(series)
    }

    override fun delete(series: Series) {
        seriesJpaRepository.delete(series)
    }
}
