package com.giwon.blog.api.controller

import com.giwon.blog.common.dto.ApiResponse
import com.giwon.blog.core.article.application.ArticleService
import com.giwon.blog.core.article.application.NeighborArticleService
import com.giwon.blog.core.article.domain.Article
import com.giwon.blog.core.article.domain.ArticleNeighbors
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import org.springframework.data.web.PageableDefault
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/articles")
class ArticleController(
    private val articleService: ArticleService,
    private val neighborArticleService: NeighborArticleService,
) {

    @GetMapping
    fun findAll(
        @RequestParam(defaultValue = "all") filter: String,
        @PageableDefault(size = 10, sort = ["publishedAt"], direction = Sort.Direction.DESC) pageable: Pageable,
    ): ApiResponse<Page<Article>> {
        return ApiResponse(articleService.findVisibleByFilter(filter, pageable))
    }

    @GetMapping("/{slug}")
    fun findBySlug(
        @PathVariable slug: String,
        @RequestParam(required = false) password: String?,
    ): ApiResponse<Article> {
        return ApiResponse(articleService.findBySlugForBlog(slug, password))
    }

    @GetMapping("/{slug}/neighbors")
    fun findNeighbors(
        @PathVariable slug: String,
        @RequestParam(required = false) series: String?,
        @RequestParam(required = false) book: String?,
    ): ApiResponse<ArticleNeighbors> {
        return ApiResponse(neighborArticleService.findNeighbors(slug, series, book))
    }
}
