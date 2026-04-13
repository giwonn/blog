package com.giwon.blog.admin.controller

import com.giwon.blog.common.dto.ApiResponse
import com.giwon.blog.core.analytics.application.AnalyticsOverview
import com.giwon.blog.core.analytics.application.AnalyticsQueryService
import com.giwon.blog.core.analytics.domain.DailyPageViewCount
import com.giwon.blog.core.analytics.domain.DailyVisitorCount
import com.giwon.blog.core.analytics.domain.ArticleAccessHistory
import com.giwon.blog.core.analytics.domain.IpAccessHistory
import com.giwon.blog.core.analytics.domain.PageViewCount
import com.giwon.blog.core.analytics.domain.ReferrerCount
import com.giwon.blog.core.analytics.domain.VisitorLocation
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

@RestController
@RequestMapping("/admin/analytics")
class AnalyticsController(
    private val analyticsQueryService: AnalyticsQueryService,
) {

    private fun toUtcRange(from: LocalDate, to: LocalDate, tz: String): Pair<LocalDateTime, LocalDateTime> {
        val zone = ZoneId.of(tz)
        val utcFrom = from.atStartOfDay(zone).toInstant().atZone(ZoneId.of("UTC")).toLocalDateTime()
        val utcTo = to.plusDays(1).atStartOfDay(zone).toInstant().atZone(ZoneId.of("UTC")).toLocalDateTime()
        return utcFrom to utcTo
    }

    @GetMapping("/overview")
    fun getOverview(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
        @RequestParam(defaultValue = "UTC") tz: String,
    ): ApiResponse<AnalyticsOverview> {
        val (utcFrom, utcTo) = toUtcRange(from, to, tz)
        return ApiResponse(analyticsQueryService.getOverview(utcFrom, utcTo))
    }

    @GetMapping("/page-views")
    fun getDailyPageViews(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
        @RequestParam(defaultValue = "UTC") tz: String,
    ): ApiResponse<List<DailyPageViewCount>> {
        val (utcFrom, utcTo) = toUtcRange(from, to, tz)
        return ApiResponse(analyticsQueryService.getDailyPageViews(utcFrom, utcTo))
    }

    @GetMapping("/daily-visitors")
    fun getDailyVisitors(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
        @RequestParam(defaultValue = "UTC") tz: String,
    ): ApiResponse<List<DailyVisitorCount>> {
        val (utcFrom, utcTo) = toUtcRange(from, to, tz)
        return ApiResponse(analyticsQueryService.getDailyVisitors(utcFrom, utcTo, tz))
    }

    @GetMapping("/top-pages")
    fun getTopPages(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
        @RequestParam(defaultValue = "UTC") tz: String,
    ): ApiResponse<List<PageViewCount>> {
        val (utcFrom, utcTo) = toUtcRange(from, to, tz)
        return ApiResponse(analyticsQueryService.getTopPages(utcFrom, utcTo))
    }

    @GetMapping("/referrers")
    fun getTopReferrers(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
        @RequestParam(defaultValue = "UTC") tz: String,
    ): ApiResponse<List<ReferrerCount>> {
        val (utcFrom, utcTo) = toUtcRange(from, to, tz)
        return ApiResponse(analyticsQueryService.getTopReferrers(utcFrom, utcTo))
    }

    @GetMapping("/visitor-locations")
    fun getVisitorLocations(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
        @RequestParam(defaultValue = "UTC") tz: String,
    ): ApiResponse<List<VisitorLocation>> {
        val (utcFrom, utcTo) = toUtcRange(from, to, tz)
        return ApiResponse(analyticsQueryService.getVisitorLocations(utcFrom, utcTo))
    }

    @GetMapping("/ip-access-history")
    fun getIpAccessHistory(
        @RequestParam ip: String,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
        @RequestParam(defaultValue = "UTC") tz: String,
    ): ApiResponse<List<IpAccessHistory>> {
        val (utcFrom, utcTo) = toUtcRange(from, to, tz)
        return ApiResponse(analyticsQueryService.getIpAccessHistory(ip, utcFrom, utcTo))
    }

    @GetMapping("/article-access-history")
    fun getArticleAccessHistory(
        @RequestParam articleId: Long,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
        @RequestParam(defaultValue = "UTC") tz: String,
    ): ApiResponse<List<ArticleAccessHistory>> {
        val (utcFrom, utcTo) = toUtcRange(from, to, tz)
        return ApiResponse(analyticsQueryService.getArticleAccessHistory(articleId, utcFrom, utcTo))
    }
}
