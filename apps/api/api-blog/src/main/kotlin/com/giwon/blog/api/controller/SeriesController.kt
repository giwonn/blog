package com.giwon.blog.api.controller

import com.giwon.blog.common.dto.ApiResponse
import com.giwon.blog.core.article.domain.Article
import com.giwon.blog.core.article.domain.ArticleReader
import com.giwon.blog.core.series.application.SeriesService
import com.giwon.blog.core.series.domain.Series
import org.springframework.web.bind.annotation.*

data class SeriesWithArticleCount(
    val id: Long,
    val title: String,
    val slug: String,
    val description: String?,
    val thumbnailUrl: String?,
    val articleCount: Int,
)

data class SeriesDetailResponse(
    val series: Series,
    val articles: List<Article>,
)

@RestController
@RequestMapping("/series")
class SeriesController(
    private val seriesService: SeriesService,
    private val articleReader: ArticleReader,
) {

    @GetMapping
    fun findAll(): ApiResponse<List<SeriesWithArticleCount>> {
        val allSeries = seriesService.findAll()
        val result = allSeries.map { series ->
            val articles = articleReader.findVisibleBySeriesId(series.id)
            SeriesWithArticleCount(
                id = series.id,
                title = series.title,
                slug = series.slug,
                description = series.description,
                thumbnailUrl = series.thumbnailUrl,
                articleCount = articles.size,
            )
        }
        return ApiResponse(result)
    }

    @GetMapping("/{slug}")
    fun findBySlug(@PathVariable slug: String): ApiResponse<SeriesDetailResponse> {
        val series = seriesService.findBySlug(slug)
        val articles = articleReader.findVisibleBySeriesId(series.id)
        return ApiResponse(SeriesDetailResponse(series = series, articles = articles))
    }
}
