package com.giwon.blog.api.controller

import com.giwon.blog.api.config.TestContainersConfig
import com.giwon.blog.core.analytics.domain.AnalyticsReader
import com.giwon.blog.core.analytics.domain.DailyArticleStats
import com.giwon.blog.core.analytics.domain.PageView
import com.giwon.blog.core.analytics.infrastructure.persistence.DailyArticleStatsJpaRepository
import com.giwon.blog.core.analytics.infrastructure.persistence.PageViewJpaRepository
import com.giwon.blog.core.article.domain.Article
import com.giwon.blog.core.article.infrastructure.persistence.ArticleJpaRepository
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import java.time.LocalDate
import java.time.LocalDateTime

@SpringBootTest
@Import(TestContainersConfig::class)
class AnalyticsReaderIntegrationTest {

    @Autowired
    lateinit var analyticsReader: AnalyticsReader

    @Autowired
    lateinit var pageViewJpaRepository: PageViewJpaRepository

    @Autowired
    lateinit var dailyArticleStatsJpaRepository: DailyArticleStatsJpaRepository

    @Autowired
    lateinit var articleJpaRepository: ArticleJpaRepository

    @BeforeEach
    fun setUp() {
        pageViewJpaRepository.deleteAll()
        dailyArticleStatsJpaRepository.deleteAll()
        articleJpaRepository.deleteAll()
    }

    @Test
    fun `findTopPages - 글별 조회수를 제목과 함께 내림차순으로 반환한다`() {
        val article1 = articleJpaRepository.save(Article(title = "첫 번째 글", content = "내용1"))
        val article2 = articleJpaRepository.save(Article(title = "두 번째 글", content = "내용2"))

        val now = LocalDateTime.now()
        repeat(3) { pageViewJpaRepository.save(PageView(path = "/articles/${article1.id}", ipAddress = "1.1.1.1", createdAt = now)) }
        repeat(1) { pageViewJpaRepository.save(PageView(path = "/articles/${article2.id}", ipAddress = "1.1.1.1", createdAt = now)) }

        val result = analyticsReader.findTopPages(now.minusHours(1), now.plusHours(1))

        assertEquals(2, result.size)
        assertEquals(article1.id, result[0].articleId)
        assertEquals("첫 번째 글", result[0].title)
        assertEquals(3L, result[0].viewCount)
    }

    @Test
    fun `countDistinctSessions - 고유 세션 수를 반환한다`() {
        val now = LocalDateTime.now()
        pageViewJpaRepository.save(PageView(path = "/a", ipAddress = "1.1.1.1", sessionId = "s1", createdAt = now))
        pageViewJpaRepository.save(PageView(path = "/b", ipAddress = "1.1.1.1", sessionId = "s1", createdAt = now))
        pageViewJpaRepository.save(PageView(path = "/a", ipAddress = "2.2.2.2", sessionId = "s2", createdAt = now))

        val count = analyticsReader.countDistinctSessions(now.minusHours(1), now.plusHours(1))

        assertEquals(2L, count)
    }

    @Test
    fun `findArticleAccessHistory - 특정 글의 접속 이력을 시간 역순으로 반환한다`() {
        val article = articleJpaRepository.save(Article(title = "테스트 글", content = "내용"))

        val now = LocalDateTime.now()
        pageViewJpaRepository.save(PageView(path = "/articles/${article.id}", ipAddress = "1.1.1.1", country = "KR", city = "Seoul", createdAt = now.minusHours(2)))
        pageViewJpaRepository.save(PageView(path = "/articles/${article.id}", ipAddress = "2.2.2.2", country = "US", city = "New York", createdAt = now.minusHours(1)))
        pageViewJpaRepository.save(PageView(path = "/articles/${article.id}", ipAddress = "3.3.3.3", country = "JP", city = "Tokyo", createdAt = now))
        // 다른 글의 접속은 포함되지 않아야 한다
        pageViewJpaRepository.save(PageView(path = "/articles/99999", ipAddress = "4.4.4.4", createdAt = now))

        val result = analyticsReader.findArticleAccessHistory(article.id!!, now.minusHours(3), now.plusHours(1))

        assertEquals(3, result.size)
        // 최신순
        assertEquals("3.3.3.3", result[0].ipAddress)
        assertEquals("Tokyo", result[0].city)
        assertEquals("JP", result[0].country)
        assertEquals("2.2.2.2", result[1].ipAddress)
        assertEquals("1.1.1.1", result[2].ipAddress)
    }

    @Test
    fun `findArticleAccessHistory - 기간 외 접속은 포함하지 않는다`() {
        val article = articleJpaRepository.save(Article(title = "테스트 글2", content = "내용"))

        val now = LocalDateTime.now()
        pageViewJpaRepository.save(PageView(path = "/articles/${article.id}", ipAddress = "1.1.1.1", createdAt = now.minusDays(10)))
        pageViewJpaRepository.save(PageView(path = "/articles/${article.id}", ipAddress = "2.2.2.2", createdAt = now))

        val result = analyticsReader.findArticleAccessHistory(article.id!!, now.minusHours(1), now.plusHours(1))

        assertEquals(1, result.size)
        assertEquals("2.2.2.2", result[0].ipAddress)
    }

    @Test
    fun `sumViewCountByArticleIdSince - 일일 집계를 합산해서 반환한다`() {
        val today = LocalDate.now()
        dailyArticleStatsJpaRepository.save(DailyArticleStats(date = today, articleId = 1L, viewCount = 100L))
        dailyArticleStatsJpaRepository.save(DailyArticleStats(date = today.minusDays(1), articleId = 1L, viewCount = 50L))
        dailyArticleStatsJpaRepository.save(DailyArticleStats(date = today, articleId = 2L, viewCount = 30L))

        val result = analyticsReader.sumViewCountByArticleIdSince(today.minusDays(30))

        assertEquals(2, result.size)
        assertEquals(1L, result[0].articleId)
        assertEquals(150L, result[0].viewCount)
    }
}
