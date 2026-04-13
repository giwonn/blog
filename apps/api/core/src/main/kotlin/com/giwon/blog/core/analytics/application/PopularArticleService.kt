package com.giwon.blog.core.analytics.application

import com.giwon.blog.core.analytics.domain.AnalyticsReader
import org.springframework.stereotype.Service
import java.time.LocalDateTime
import java.time.LocalTime

@Service
class PopularArticleService(
    private val analyticsReader: AnalyticsReader,
) {

    fun getPopularArticles(limit: Int = 5): List<PopularArticle> {
        val now = LocalDateTime.now()
        val from = now.minusDays(30).with(LocalTime.MIN)

        return analyticsReader.findTopPages(from, now)
            .take(limit)
            .map { page ->
                PopularArticle(
                    id = page.articleId,
                    title = page.title,
                    viewCount = page.viewCount,
                )
            }
    }
}

data class PopularArticle(
    val id: Long,
    val title: String,
    val viewCount: Long,
)
