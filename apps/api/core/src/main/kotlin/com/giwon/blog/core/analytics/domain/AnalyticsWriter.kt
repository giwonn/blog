package com.giwon.blog.core.analytics.domain

interface AnalyticsWriter {
    fun savePageView(pageView: PageView)
    fun upsertSession(sessionId: String, ipAddress: String, userAgent: String?)
    fun saveDailyArticleStats(stats: List<DailyArticleStats>)
    fun replaceArticleStats(stats: List<ArticleStats>)
    fun saveDailyVisitorStats(stats: DailyVisitorStats)
}
