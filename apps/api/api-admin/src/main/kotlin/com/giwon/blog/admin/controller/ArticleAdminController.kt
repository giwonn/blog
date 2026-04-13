package com.giwon.blog.admin.controller

import com.giwon.blog.common.dto.ApiResponse
import com.giwon.blog.core.article.application.ArticleService
import com.giwon.blog.core.article.domain.Article
import com.giwon.blog.core.article.domain.ArticleStatus
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.data.web.PageableDefault
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*


@RestController
@RequestMapping("/admin/articles")
class ArticleAdminController(
    private val articleService: ArticleService,
) {

    @GetMapping
    fun findAll(@PageableDefault(size = 10, sort = ["createdAt"], direction = Sort.Direction.DESC) pageable: Pageable): ApiResponse<Page<Article>> {
        return ApiResponse(articleService.findAll(pageable))
    }

    @GetMapping("/{id}")
    fun findById(@PathVariable id: Long): ApiResponse<Article> {
        return ApiResponse(articleService.findById(id))
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@Valid @RequestBody request: ArticleRequest): ApiResponse<Article> {
        return ApiResponse(articleService.create(
            title = request.title,
            slug = request.slug,
            content = request.content,
            status = request.status,
            password = request.password,
            seriesId = request.seriesId,
            orderInSeries = request.orderInSeries,
            bookId = request.bookId,
            orderInBook = request.orderInBook,
        ))
    }

    @PutMapping("/{id}")
    fun update(@PathVariable id: Long, @Valid @RequestBody request: ArticleRequest): ApiResponse<Article> {
        return ApiResponse(articleService.update(
            id = id,
            title = request.title,
            slug = request.slug,
            content = request.content,
            status = request.status,
            password = request.password,
            seriesId = request.seriesId,
            orderInSeries = request.orderInSeries,
            bookId = request.bookId,
            orderInBook = request.orderInBook,
        ))
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: Long) {
        articleService.delete(id)
    }
}

data class ArticleRequest(
    @field:NotBlank val title: String,
    @field:NotBlank val slug: String,
    @field:NotBlank val content: String,
    val status: ArticleStatus = ArticleStatus.DRAFT,
    val password: String? = null,
    val seriesId: Long? = null,
    val orderInSeries: Int? = null,
    val bookId: Long? = null,
    val orderInBook: Int? = null,
)
