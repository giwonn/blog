package com.giwon.blog.core.analytics.application

import com.giwon.blog.core.analytics.domain.AnalyticsReader
import com.giwon.blog.core.analytics.domain.PageViewCount
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.*
import java.time.LocalDateTime

@ExtendWith(MockitoExtension::class)
class PopularArticleServiceTest {

    @Mock lateinit var analyticsReader: AnalyticsReader

    lateinit var popularArticleService: PopularArticleService

    @BeforeEach
    fun setUp() {
        popularArticleService = PopularArticleService(analyticsReader)
    }

    @Test
    fun `getPopularArticles - 최근 30일 페이지뷰 기준 상위 글을 반환한다`() {
        whenever(analyticsReader.findTopPages(any<LocalDateTime>(), any<LocalDateTime>())).thenReturn(listOf(
            PageViewCount(articleId = 3L, title = "글3", viewCount = 100L),
            PageViewCount(articleId = 1L, title = "글1", viewCount = 50L),
        ))

        val result = popularArticleService.getPopularArticles(5)

        assertEquals(2, result.size)
        assertEquals("글3", result[0].title)
        assertEquals(100L, result[0].viewCount)
        assertEquals("글1", result[1].title)
        assertEquals(50L, result[1].viewCount)
    }

    @Test
    fun `getPopularArticles - limit만큼만 반환한다`() {
        whenever(analyticsReader.findTopPages(any<LocalDateTime>(), any<LocalDateTime>())).thenReturn(listOf(
            PageViewCount(articleId = 1L, title = "글1", viewCount = 100L),
            PageViewCount(articleId = 2L, title = "글2", viewCount = 80L),
            PageViewCount(articleId = 3L, title = "글3", viewCount = 60L),
        ))

        val result = popularArticleService.getPopularArticles(2)

        assertEquals(2, result.size)
    }
}
