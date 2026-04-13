package com.giwon.blog.core.analytics.scheduler

import com.giwon.blog.core.analytics.domain.AnalyticsReader
import com.giwon.blog.core.analytics.domain.AnalyticsWriter
import com.giwon.blog.core.analytics.domain.DailyVisitorStats
import com.giwon.blog.core.batch.domain.BatchJobLogger
import com.giwon.blog.core.batch.domain.BatchJobLog
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.*

@ExtendWith(MockitoExtension::class)
class VisitorStatsAggregatorTest {

    @Mock lateinit var analyticsReader: AnalyticsReader
    @Mock lateinit var analyticsWriter: AnalyticsWriter
    @Mock lateinit var batchJobLogger: BatchJobLogger

    lateinit var aggregator: VisitorStatsAggregator

    @BeforeEach
    fun setUp() {
        aggregator = VisitorStatsAggregator(analyticsReader, analyticsWriter, batchJobLogger)
    }

    @Test
    fun `aggregateDaily - 어제 하루치 고유 세션 수를 집계한다`() {
        whenever(analyticsReader.countDistinctSessions(any(), any())).thenReturn(42L)
        aggregator.aggregateDaily()
        verify(analyticsWriter).saveDailyVisitorStats(argThat<DailyVisitorStats> { stats -> stats.visitorCount == 42L })
    }

    @Test
    fun `aggregateDaily - 방문자가 없으면 0으로 저장한다`() {
        whenever(analyticsReader.countDistinctSessions(any(), any())).thenReturn(0L)
        aggregator.aggregateDaily()
        verify(analyticsWriter).saveDailyVisitorStats(argThat<DailyVisitorStats> { stats -> stats.visitorCount == 0L })
    }
}
