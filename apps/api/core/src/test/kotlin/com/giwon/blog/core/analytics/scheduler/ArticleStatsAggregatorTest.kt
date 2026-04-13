package com.giwon.blog.core.analytics.scheduler

import com.giwon.blog.core.analytics.domain.*
import com.giwon.blog.core.batch.domain.BatchJobLogger
import com.giwon.blog.core.batch.domain.BatchJobLog
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.*
import java.time.LocalDate

@ExtendWith(MockitoExtension::class)
class ArticleStatsAggregatorTest {

    @Mock lateinit var analyticsReader: AnalyticsReader
    @Mock lateinit var analyticsWriter: AnalyticsWriter
    @Mock lateinit var batchJobLogger: BatchJobLogger

    lateinit var aggregator: ArticleStatsAggregator

    @BeforeEach
    fun setUp() {
        aggregator = ArticleStatsAggregator(analyticsReader, analyticsWriter, batchJobLogger)
    }

    @Test
    fun `aggregateDaily - 어제 하루치 PageView를 집계해서 DailyArticleStats에 저장한다`() {
        val yesterday = LocalDate.now().minusDays(1)
        whenever(analyticsReader.findTopPages(any(), any())).thenReturn(listOf(
            PageViewCount(1L, "첫 번째 글", 100L),
            PageViewCount(2L, "두 번째 글", 50L),
        ))

        aggregator.aggregateDaily()

        verify(analyticsWriter).saveDailyArticleStats(argThat<List<DailyArticleStats>> { stats ->
            stats.size == 2 &&
                stats[0].articleId == 1L && stats[0].viewCount == 100L && stats[0].date == yesterday &&
                stats[1].articleId == 2L && stats[1].viewCount == 50L
        })
    }

    @Test
    fun `aggregateRolling - DailyArticleStats 30일분을 합쳐서 ArticleStats에 저장한다`() {
        whenever(analyticsReader.sumViewCountByArticleIdSince(any())).thenReturn(listOf(
            ArticleViewCount(1L, 300L),
            ArticleViewCount(2L, 150L),
        ))

        aggregator.aggregateRolling()

        verify(analyticsWriter).replaceArticleStats(argThat<List<ArticleStats>> { stats ->
            stats.size == 2 &&
                stats[0].articleId == 1L && stats[0].viewCount == 300L &&
                stats[1].articleId == 2L && stats[1].viewCount == 150L
        })
    }
}
