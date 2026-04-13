package com.giwon.blog.core.series.application

import com.giwon.blog.common.exception.BusinessException
import com.giwon.blog.common.exception.ErrorCode
import com.giwon.blog.core.series.domain.Series
import com.giwon.blog.core.series.domain.SeriesReader
import com.giwon.blog.core.series.domain.SeriesWriter
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime

@Service
class SeriesService(
    private val seriesReader: SeriesReader,
    private val seriesWriter: SeriesWriter,
) {

    fun findAll(): List<Series> {
        return seriesReader.findAll()
    }

    fun findById(id: Long): Series {
        return seriesReader.findById(id)
            ?: throw BusinessException(ErrorCode.SERIES_NOT_FOUND)
    }

    fun findBySlug(slug: String): Series {
        return seriesReader.findBySlug(slug)
            ?: throw BusinessException(ErrorCode.SERIES_NOT_FOUND)
    }

    @Transactional
    fun create(
        title: String,
        slug: String,
        description: String?,
        thumbnailUrl: String?,
    ): Series {
        if (seriesReader.existsBySlug(slug)) {
            throw BusinessException(ErrorCode.SERIES_SLUG_DUPLICATE)
        }

        val series = Series(
            title = title,
            slug = slug,
            description = description,
            thumbnailUrl = thumbnailUrl,
        )

        return seriesWriter.save(series)
    }

    @Transactional
    fun update(
        id: Long,
        title: String,
        slug: String,
        description: String?,
        thumbnailUrl: String?,
    ): Series {
        val series = seriesReader.findById(id)
            ?: throw BusinessException(ErrorCode.SERIES_NOT_FOUND)

        if (slug != series.slug) {
            if (seriesReader.existsBySlug(slug)) {
                throw BusinessException(ErrorCode.SERIES_SLUG_DUPLICATE)
            }
        }

        series.title = title
        series.slug = slug
        series.description = description
        series.thumbnailUrl = thumbnailUrl
        series.updatedAt = LocalDateTime.now()

        return seriesWriter.save(series)
    }

    @Transactional
    fun delete(id: Long) {
        val series = seriesReader.findById(id)
            ?: throw BusinessException(ErrorCode.SERIES_NOT_FOUND)

        seriesWriter.delete(series)
    }
}
