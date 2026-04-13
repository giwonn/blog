package com.giwon.blog.admin.controller

import com.giwon.blog.common.dto.ApiResponse
import com.giwon.blog.core.analytics.application.PopularArticle
import com.giwon.blog.core.analytics.application.PopularArticleService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/admin/dashboard")
class DashboardController(
    private val popularArticleService: PopularArticleService,
) {

    @GetMapping("/popular-articles")
    fun getPopularArticles(): ApiResponse<List<PopularArticle>> {
        return ApiResponse(popularArticleService.getPopularArticles(5))
    }
}
