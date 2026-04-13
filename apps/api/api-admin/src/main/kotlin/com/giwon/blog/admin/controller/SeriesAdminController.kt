package com.giwon.blog.admin.controller

import com.giwon.blog.common.dto.ApiResponse
import com.giwon.blog.core.article.application.ArticleService
import com.giwon.blog.core.article.domain.Article
import com.giwon.blog.core.article.domain.ArticleReader
import com.giwon.blog.core.series.application.SeriesService
import com.giwon.blog.core.series.domain.Series
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/admin/series")
class SeriesAdminController(
    private val seriesService: SeriesService,
    private val articleReader: ArticleReader,
    private val articleService: ArticleService,
) {

    @GetMapping
    fun findAll(): ApiResponse<List<Series>> {
        return ApiResponse(seriesService.findAll())
    }

    @GetMapping("/{id}")
    fun findById(@PathVariable id: Long): ApiResponse<SeriesAdminDetail> {
        val series = seriesService.findById(id)
        val articles = articleReader.findAllBySeriesId(id).sortedBy { it.orderInSeries }
        return ApiResponse(SeriesAdminDetail(series, articles))
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@Valid @RequestBody request: SeriesRequest): ApiResponse<Series> {
        return ApiResponse(seriesService.create(
            title = request.title,
            slug = request.slug,
            description = request.description,
            thumbnailUrl = request.thumbnailUrl,
        ))
    }

    @PutMapping("/{id}")
    fun update(@PathVariable id: Long, @Valid @RequestBody request: SeriesRequest): ApiResponse<Series> {
        return ApiResponse(seriesService.update(
            id = id,
            title = request.title,
            slug = request.slug,
            description = request.description,
            thumbnailUrl = request.thumbnailUrl,
        ))
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: Long) {
        seriesService.delete(id)
    }

    @PutMapping("/{id}/article-order")
    fun updateArticleOrder(
        @PathVariable id: Long,
        @RequestBody request: ArticleOrderRequest,
    ): ApiResponse<String> {
        seriesService.findById(id)

        request.articleIds.forEachIndexed { index, articleId ->
            val article = articleService.findById(articleId)
            articleService.update(
                id = articleId,
                title = article.title,
                content = article.content,
                slug = article.slug,
                status = article.status,
                password = article.password,
                seriesId = id,
                orderInSeries = index + 1,
                bookId = article.bookId,
                orderInBook = article.orderInBook,
            )
        }

        return ApiResponse("Article order updated successfully")
    }
}

data class SeriesRequest(
    @field:NotBlank val title: String,
    @field:NotBlank val slug: String,
    val description: String? = null,
    val thumbnailUrl: String? = null,
)

data class SeriesAdminDetail(
    val series: Series,
    val articles: List<Article>,
)

data class ArticleOrderRequest(
    val articleIds: List<Long>,
)
