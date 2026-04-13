package com.giwon.blog.core.analytics.scheduler

import com.giwon.blog.core.analytics.domain.AnalyticsReader
import com.giwon.blog.core.analytics.domain.AnalyticsWriter
import com.giwon.blog.core.analytics.domain.DailyVisitorStats
import com.giwon.blog.core.batch.domain.BatchJobLogger
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

@Component
class VisitorStatsAggregator(
    private val analyticsReader: AnalyticsReader,
    private val analyticsWriter: AnalyticsWriter,
    private val batchJobLogger: BatchJobLogger,
) {

    @Scheduled(cron = "0 5 3 * * *")
    @Transactional
    fun aggregateDaily() {
        val yesterday = LocalDate.now().minusDays(1)
        val log = batchJobLogger.start("visitor_stats_aggregate", yesterday)
        try {
            val from = yesterday.atStartOfDay()
            val to = yesterday.atTime(23, 59, 59)

            val visitorCount = analyticsReader.countDistinctSessions(from, to)

            analyticsWriter.saveDailyVisitorStats(
                DailyVisitorStats(date = yesterday, visitorCount = visitorCount)
            )
            log.success()
        } catch (e: Exception) {
            log.fail(e.message ?: "Unknown error")
            throw e
        } finally {
            batchJobLogger.save(log)
        }
    }
}
