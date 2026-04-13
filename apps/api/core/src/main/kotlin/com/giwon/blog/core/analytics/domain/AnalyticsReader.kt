package com.giwon.blog.core.analytics.domain

import java.time.LocalDate
import java.time.LocalDateTime

interface AnalyticsReader {
    fun findTopPages(from: LocalDateTime, to: LocalDateTime): List<PageViewCount>
    fun findTopReferrers(from: LocalDateTime, to: LocalDateTime): List<ReferrerCount>
    fun findDailyPageViews(from: LocalDateTime, to: LocalDateTime): List<DailyPageViewCount>
    fun findDailyVisitors(from: LocalDateTime, to: LocalDateTime, timezone: String): List<DailyVisitorCount>
    fun countDistinctSessions(from: LocalDateTime, to: LocalDateTime): Long
    fun sumViewCountByArticleIdSince(since: LocalDate): List<ArticleViewCount>
    fun findTopArticleStats(limit: Int): List<ArticleStatsRow>
    fun getTotalVisitorCount(): Long
    fun getVisitorCountByDate(date: LocalDate): VisitorCount
    fun findVisitorLocations(from: LocalDateTime, to: LocalDateTime): List<VisitorLocation>
    fun findIpAccessHistory(ipAddress: String, from: LocalDateTime, to: LocalDateTime): List<IpAccessHistory>
    fun findArticleAccessHistory(articleId: Long, from: LocalDateTime, to: LocalDateTime): List<ArticleAccessHistory>
}

data class PageViewCount(val articleId: Long, val title: String, val viewCount: Long)
data class ReferrerCount(val referrer: String, val viewCount: Long)
data class DailyPageViewCount(val date: String, val viewCount: Long)
data class DailyVisitorCount(val date: String, val visitorCount: Long)
data class ArticleViewCount(val articleId: Long, val viewCount: Long)
data class ArticleStatsRow(val articleId: Long, val viewCount: Long)
data class VisitorCount(val count: Long)
data class VisitorLocation(val ipAddress: String, val latitude: Double, val longitude: Double, val country: String?, val city: String?, val visitCount: Long, val lastVisitedAt: LocalDateTime)
data class IpAccessHistory(val path: String, val ipAddress: String, val country: String?, val city: String?, val createdAt: LocalDateTime)
data class ArticleAccessHistory(val ipAddress: String, val country: String?, val city: String?, val createdAt: LocalDateTime)
