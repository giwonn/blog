package com.giwon.blog.core.analytics.application

import com.giwon.blog.core.analytics.domain.AnalyticsReader
import com.giwon.blog.core.analytics.domain.VisitorCounter
import org.springframework.stereotype.Service
import java.time.LocalDate

@Service
class VisitorStatsService(
    private val analyticsReader: AnalyticsReader,
    private val visitorCounter: VisitorCounter,
) {

    fun getVisitorSummary(): VisitorSummary {
        val today = LocalDate.now()
        val yesterday = today.minusDays(1)

        val todayCount = getVisitorCountWithFallback(today)
        val yesterdayCount = getVisitorCountWithFallback(yesterday)
        val total = analyticsReader.getTotalVisitorCount() + todayCount

        return VisitorSummary(total = total, today = todayCount, yesterday = yesterdayCount)
    }

    private fun getVisitorCountWithFallback(date: LocalDate): Long {
        val redisCount = visitorCounter.getVisitorCount(date)
        if (redisCount > 0) return redisCount

        // Redis가 0이면 DB에서 확인 (Redis 장애 또는 데이터 유실 대비)
        val dbCount = analyticsReader.getVisitorCountByDate(date).count
        if (dbCount > 0) return dbCount

        // 배치 미집계 (오늘/어제) → page_views에서 직접 카운트
        val from = date.atStartOfDay()
        val to = date.atTime(23, 59, 59)
        return analyticsReader.countDistinctSessions(from, to)
    }
}

data class VisitorSummary(
    val total: Long,
    val today: Long,
    val yesterday: Long,
)
