package com.giwon.blog.core.analytics.infrastructure.persistence

import com.giwon.blog.core.analytics.domain.*
import com.giwon.blog.core.analytics.domain.QDailyArticleStats.dailyArticleStats
import com.giwon.blog.core.analytics.domain.QDailyVisitorStats.dailyVisitorStats
import com.giwon.blog.core.analytics.domain.QPageView.pageView
import com.giwon.blog.core.analytics.domain.QArticleStats.articleStats
import com.giwon.blog.core.article.domain.QArticle.article
import com.querydsl.core.types.Projections
import com.querydsl.core.types.dsl.CaseBuilder
import com.querydsl.core.types.dsl.Expressions
import com.querydsl.jpa.impl.JPAQueryFactory
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.time.LocalDateTime

@Component
class QueryDslAnalyticsReader(
    private val queryFactory: JPAQueryFactory,
) : AnalyticsReader {

    override fun findTopPages(from: LocalDateTime, to: LocalDateTime): List<PageViewCount> {
        val articleIdExpr = Expressions.numberTemplate(
            Long::class.java,
            "CAST(SUBSTRING({0}, 11) AS long)",
            pageView.path,
        )

        return queryFactory
            .select(Projections.constructor(
                PageViewCount::class.java,
                article.id,
                article.title,
                pageView.count(),
            ))
            .from(pageView)
            .join(article).on(article.id.eq(articleIdExpr))
            .where(
                pageView.createdAt.between(from, to),
                pageView.path.like("/articles/%"),
            )
            .groupBy(article.id, article.title)
            .orderBy(pageView.count().desc())
            .fetch()
    }

    override fun findTopReferrers(from: LocalDateTime, to: LocalDateTime): List<ReferrerCount> {
        val directLabel = Expressions.asString("(직접 접속)")
        val referrerOrDirect = CaseBuilder()
            .`when`(pageView.referrer.isNull).then(directLabel)
            .otherwise(pageView.referrer)

        return queryFactory
            .select(Projections.constructor(
                ReferrerCount::class.java,
                referrerOrDirect,
                pageView.count(),
            ))
            .from(pageView)
            .where(
                pageView.createdAt.between(from, to),
                pageView.referrer.isNull
                    .or(pageView.referrer.notLike("%blog.giwon.dev%")),
            )
            .groupBy(referrerOrDirect)
            .orderBy(pageView.count().desc())
            .fetch()
    }

    override fun findDailyPageViews(from: LocalDateTime, to: LocalDateTime): List<DailyPageViewCount> {
        return queryFactory
            .select(Projections.constructor(
                DailyPageViewCount::class.java,
                pageView.createdAt.stringValue().substring(0, 10),
                pageView.count(),
            ))
            .from(pageView)
            .where(pageView.createdAt.between(from, to))
            .groupBy(pageView.createdAt.stringValue().substring(0, 10))
            .orderBy(pageView.createdAt.stringValue().substring(0, 10).asc())
            .fetch()
    }

    override fun findDailyVisitors(from: LocalDateTime, to: LocalDateTime, timezone: String): List<DailyVisitorCount> {
        val dateInTz = Expressions.stringTemplate(
            "TO_CHAR({0} AT TIME ZONE {1}, 'YYYY-MM-DD')",
            pageView.createdAt,
            Expressions.constant(timezone),
        )
        return queryFactory
            .select(Projections.constructor(
                DailyVisitorCount::class.java,
                dateInTz,
                pageView.sessionId.countDistinct(),
            ))
            .from(pageView)
            .where(
                pageView.createdAt.between(from, to),
                pageView.sessionId.isNotNull,
            )
            .groupBy(dateInTz)
            .orderBy(dateInTz.asc())
            .fetch()
    }

    override fun countDistinctSessions(from: LocalDateTime, to: LocalDateTime): Long {
        return queryFactory
            .select(pageView.sessionId.countDistinct())
            .from(pageView)
            .where(
                pageView.createdAt.between(from, to),
                pageView.sessionId.isNotNull,
            )
            .fetchOne() ?: 0L
    }

    override fun sumViewCountByArticleIdSince(since: LocalDate): List<ArticleViewCount> {
        return queryFactory
            .select(Projections.constructor(
                ArticleViewCount::class.java,
                dailyArticleStats.articleId,
                dailyArticleStats.viewCount.sum(),
            ))
            .from(dailyArticleStats)
            .where(dailyArticleStats.date.goe(since))
            .groupBy(dailyArticleStats.articleId)
            .orderBy(dailyArticleStats.viewCount.sum().desc())
            .fetch()
    }

    override fun findTopArticleStats(limit: Int): List<ArticleStatsRow> {
        return queryFactory
            .select(Projections.constructor(
                ArticleStatsRow::class.java,
                articleStats.articleId,
                articleStats.viewCount,
            ))
            .from(articleStats)
            .orderBy(articleStats.viewCount.desc())
            .limit(limit.toLong())
            .fetch()
    }

    override fun getTotalVisitorCount(): Long {
        return queryFactory
            .select(dailyVisitorStats.visitorCount.sum())
            .from(dailyVisitorStats)
            .fetchOne() ?: 0L
    }

    override fun getVisitorCountByDate(date: LocalDate): VisitorCount {
        val count = queryFactory
            .select(dailyVisitorStats.visitorCount)
            .from(dailyVisitorStats)
            .where(dailyVisitorStats.date.eq(date))
            .fetchOne() ?: 0L
        return VisitorCount(count)
    }

    override fun findVisitorLocations(from: LocalDateTime, to: LocalDateTime): List<VisitorLocation> {
        return queryFactory
            .select(Projections.constructor(
                VisitorLocation::class.java,
                pageView.ipAddress,
                pageView.latitude,
                pageView.longitude,
                pageView.country,
                pageView.city,
                pageView.count(),
                pageView.createdAt.max(),
            ))
            .from(pageView)
            .where(
                pageView.createdAt.between(from, to),
                pageView.latitude.isNotNull,
                pageView.longitude.isNotNull,
            )
            .groupBy(pageView.ipAddress, pageView.latitude, pageView.longitude, pageView.country, pageView.city)
            .orderBy(pageView.count().desc())
            .fetch()
    }

    override fun findIpAccessHistory(ipAddress: String, from: LocalDateTime, to: LocalDateTime): List<IpAccessHistory> {
        return queryFactory
            .select(Projections.constructor(
                IpAccessHistory::class.java,
                pageView.path,
                pageView.ipAddress,
                pageView.country,
                pageView.city,
                pageView.createdAt,
            ))
            .from(pageView)
            .where(
                pageView.ipAddress.eq(ipAddress),
                pageView.createdAt.between(from, to),
            )
            .orderBy(pageView.createdAt.desc())
            .fetch()
    }

    override fun findArticleAccessHistory(articleId: Long, from: LocalDateTime, to: LocalDateTime): List<ArticleAccessHistory> {
        return queryFactory
            .select(Projections.constructor(
                ArticleAccessHistory::class.java,
                pageView.ipAddress,
                pageView.country,
                pageView.city,
                pageView.createdAt,
            ))
            .from(pageView)
            .where(
                pageView.path.eq("/articles/$articleId"),
                pageView.createdAt.between(from, to),
            )
            .orderBy(pageView.createdAt.desc())
            .fetch()
    }
}
