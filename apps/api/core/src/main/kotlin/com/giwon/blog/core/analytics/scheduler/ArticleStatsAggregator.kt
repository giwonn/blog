package com.giwon.blog.core.analytics.scheduler

import com.giwon.blog.core.analytics.domain.*
import com.giwon.blog.core.batch.domain.BatchJobLogger
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

@Component
class ArticleStatsAggregator(
    private val analyticsReader: AnalyticsReader,
    private val analyticsWriter: AnalyticsWriter,
    private val batchJobLogger: BatchJobLogger,
) {

    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    fun aggregate() {
        val yesterday = LocalDate.now().minusDays(1)
        val log = batchJobLogger.start("article_stats_aggregate", yesterday)
        try {
            aggregateDaily(yesterday)
            aggregateRolling()
            log.success()
        } catch (e: Exception) {
            log.fail(e.message ?: "Unknown error")
            throw e
        } finally {
            batchJobLogger.save(log)
        }
    }

    fun aggregateDaily(date: LocalDate = LocalDate.now().minusDays(1)) {
        val from = date.atStartOfDay()
        val to = date.atTime(23, 59, 59)
        val topPages = analyticsReader.findTopPages(from, to)

        val dailyStats = topPages.map { pv ->
            DailyArticleStats(date = date, articleId = pv.articleId, viewCount = pv.viewCount)
        }

        analyticsWriter.saveDailyArticleStats(dailyStats)
    }

    fun aggregateRolling() {
        val since = LocalDate.now().minusDays(30)
        val rollingStats = analyticsReader.sumViewCountByArticleIdSince(since)

        val stats = rollingStats.map { row ->
            ArticleStats(articleId = row.articleId, viewCount = row.viewCount)
        }

        analyticsWriter.replaceArticleStats(stats)
    }
}
