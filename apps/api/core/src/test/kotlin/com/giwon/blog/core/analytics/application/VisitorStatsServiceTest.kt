package com.giwon.blog.core.analytics.application

import com.giwon.blog.core.analytics.domain.AnalyticsReader
import com.giwon.blog.core.analytics.domain.VisitorCount
import com.giwon.blog.core.analytics.domain.VisitorCounter
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.*
import java.time.LocalDate

@ExtendWith(MockitoExtension::class)
class VisitorStatsServiceTest {

    @Mock lateinit var analyticsReader: AnalyticsReader
    @Mock lateinit var visitorCounter: VisitorCounter

    lateinit var visitorStatsService: VisitorStatsService

    private val today = LocalDate.now()
    private val yesterday = today.minusDays(1)

    @BeforeEach
    fun setUp() {
        visitorStatsService = VisitorStatsService(analyticsReader, visitorCounter)
    }

    @Test
    fun `오늘 방문자는 Redis에서 조회한다`() {
        whenever(visitorCounter.getVisitorCount(today)).thenReturn(50L)
        whenever(visitorCounter.getVisitorCount(yesterday)).thenReturn(30L)
        whenever(analyticsReader.getTotalVisitorCount()).thenReturn(1000L)

        val result = visitorStatsService.getVisitorSummary()

        assertEquals(50L, result.today)
        assertEquals(1050L, result.total)
    }

    @Test
    fun `어제 방문자 - Redis에 있으면 Redis 사용`() {
        whenever(visitorCounter.getVisitorCount(today)).thenReturn(10L)
        whenever(visitorCounter.getVisitorCount(yesterday)).thenReturn(30L)
        whenever(analyticsReader.getTotalVisitorCount()).thenReturn(500L)

        val result = visitorStatsService.getVisitorSummary()

        assertEquals(30L, result.yesterday)
    }

    @Test
    fun `어제 방문자 - Redis 0이면 daily_visitor_stats 폴백`() {
        whenever(visitorCounter.getVisitorCount(today)).thenReturn(10L)
        whenever(visitorCounter.getVisitorCount(yesterday)).thenReturn(0L)
        whenever(analyticsReader.getTotalVisitorCount()).thenReturn(500L)
        whenever(analyticsReader.getVisitorCountByDate(yesterday)).thenReturn(VisitorCount(25L))

        val result = visitorStatsService.getVisitorSummary()

        assertEquals(25L, result.yesterday)
    }

    @Test
    fun `Redis와 daily_visitor_stats 모두 0이면 page_views에서 직접 카운트`() {
        whenever(visitorCounter.getVisitorCount(today)).thenReturn(0L)
        whenever(visitorCounter.getVisitorCount(yesterday)).thenReturn(0L)
        whenever(analyticsReader.getTotalVisitorCount()).thenReturn(100L)
        whenever(analyticsReader.getVisitorCountByDate(any())).thenReturn(VisitorCount(0L))

        val todayFrom = today.atStartOfDay()
        val todayTo = today.atTime(23, 59, 59)
        whenever(analyticsReader.countDistinctSessions(todayFrom, todayTo)).thenReturn(5L)

        val yesterdayFrom = yesterday.atStartOfDay()
        val yesterdayTo = yesterday.atTime(23, 59, 59)
        whenever(analyticsReader.countDistinctSessions(yesterdayFrom, yesterdayTo)).thenReturn(3L)

        val result = visitorStatsService.getVisitorSummary()

        assertEquals(5L, result.today)
        assertEquals(3L, result.yesterday)
        assertEquals(105L, result.total)
    }

    @Test
    fun `데이터가 전혀 없으면 모두 0을 반환한다`() {
        whenever(visitorCounter.getVisitorCount(any())).thenReturn(0L)
        whenever(analyticsReader.getTotalVisitorCount()).thenReturn(0L)
        whenever(analyticsReader.getVisitorCountByDate(any())).thenReturn(VisitorCount(0L))
        whenever(analyticsReader.countDistinctSessions(any(), any())).thenReturn(0L)

        val result = visitorStatsService.getVisitorSummary()

        assertEquals(0L, result.total)
        assertEquals(0L, result.today)
        assertEquals(0L, result.yesterday)
    }
}
