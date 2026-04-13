package com.giwon.blog.core.analytics.application

import com.giwon.blog.core.analytics.domain.*
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.time.LocalDateTime

@Service
class AnalyticsQueryService(
    private val analyticsReader: AnalyticsReader,
) {

    fun getOverview(from: LocalDateTime, to: LocalDateTime): AnalyticsOverview {
        val totalPageViews = analyticsReader.findTopPages(from, to).sumOf { it.viewCount }
        val uniqueVisitors = analyticsReader.countDistinctSessions(from, to)
        return AnalyticsOverview(totalPageViews = totalPageViews, uniqueVisitors = uniqueVisitors)
    }

    fun getDailyPageViews(from: LocalDateTime, to: LocalDateTime): List<DailyPageViewCount> {
        return analyticsReader.findDailyPageViews(from, to)
    }

    fun getDailyVisitors(from: LocalDateTime, to: LocalDateTime, timezone: String): List<DailyVisitorCount> {
        return analyticsReader.findDailyVisitors(from, to, timezone)
    }

    fun getTopPages(from: LocalDateTime, to: LocalDateTime): List<PageViewCount> {
        return analyticsReader.findTopPages(from, to)
    }

    fun getTopReferrers(from: LocalDateTime, to: LocalDateTime): List<ReferrerCount> {
        return analyticsReader.findTopReferrers(from, to)
    }

    fun getVisitorLocations(from: LocalDateTime, to: LocalDateTime): List<VisitorLocation> {
        return analyticsReader.findVisitorLocations(from, to)
    }

    fun getIpAccessHistory(ipAddress: String, from: LocalDateTime, to: LocalDateTime): List<IpAccessHistory> {
        return analyticsReader.findIpAccessHistory(ipAddress, from, to)
    }

    fun getArticleAccessHistory(articleId: Long, from: LocalDateTime, to: LocalDateTime): List<ArticleAccessHistory> {
        return analyticsReader.findArticleAccessHistory(articleId, from, to)
    }
}

data class AnalyticsOverview(val totalPageViews: Long, val uniqueVisitors: Long)
