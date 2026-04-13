package com.giwon.blog.api.controller

import com.giwon.blog.common.dto.ApiResponse
import com.giwon.blog.core.analytics.application.PopularArticle
import com.giwon.blog.core.analytics.application.PopularArticleService
import com.giwon.blog.core.analytics.application.VisitorStatsService
import com.giwon.blog.core.analytics.application.VisitorSummary
import com.giwon.blog.core.comment.application.GitHubCommentService
import com.giwon.blog.core.comment.application.RecentComment
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/sidebar")
class SidebarController(
    private val popularArticleService: PopularArticleService,
    private val gitHubCommentService: GitHubCommentService,
    private val visitorStatsService: VisitorStatsService,
) {

    @GetMapping("/popular-articles")
    fun getPopularArticles(): ApiResponse<List<PopularArticle>> {
        return ApiResponse(popularArticleService.getPopularArticles(5))
    }

    @GetMapping("/recent-comments")
    fun getRecentComments(): ApiResponse<List<RecentComment>> {
        return ApiResponse(gitHubCommentService.getRecentComments(5))
    }

    @GetMapping("/visitors")
    fun getVisitorSummary(): ApiResponse<VisitorSummary> {
        return ApiResponse(visitorStatsService.getVisitorSummary())
    }
}
