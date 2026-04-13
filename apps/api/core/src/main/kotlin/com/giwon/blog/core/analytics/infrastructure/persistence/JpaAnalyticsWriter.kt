package com.giwon.blog.core.analytics.infrastructure.persistence

import com.giwon.blog.core.analytics.domain.*
import org.springframework.stereotype.Component
import java.time.LocalDateTime

@Component
class JpaAnalyticsWriter(
    private val pageViewJpaRepository: PageViewJpaRepository,
    private val visitorSessionJpaRepository: VisitorSessionJpaRepository,
    private val dailyArticleStatsJpaRepository: DailyArticleStatsJpaRepository,
    private val articleStatsJpaRepository: ArticleStatsJpaRepository,
    private val dailyVisitorStatsJpaRepository: DailyVisitorStatsJpaRepository,
) : AnalyticsWriter {

    override fun savePageView(pageView: PageView) {
        pageViewJpaRepository.save(pageView)
    }

    override fun upsertSession(sessionId: String, ipAddress: String, userAgent: String?) {
        val existing = visitorSessionJpaRepository.findBySessionId(sessionId)
        if (existing.isPresent) {
            val session = existing.get()
            session.lastVisitAt = LocalDateTime.now()
            session.pageViewCount += 1
            visitorSessionJpaRepository.save(session)
        } else {
            visitorSessionJpaRepository.save(
                VisitorSession(sessionId = sessionId, ipAddress = ipAddress, userAgent = userAgent)
            )
        }
    }

    override fun saveDailyArticleStats(stats: List<DailyArticleStats>) {
        dailyArticleStatsJpaRepository.saveAll(stats)
    }

    override fun replaceArticleStats(stats: List<ArticleStats>) {
        articleStatsJpaRepository.deleteAll()
        articleStatsJpaRepository.saveAll(stats)
    }

    override fun saveDailyVisitorStats(stats: DailyVisitorStats) {
        dailyVisitorStatsJpaRepository.save(stats)
    }
}
