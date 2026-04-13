package com.giwon.blog.api.controller

import com.giwon.blog.core.analytics.application.AnalyticsCollectionService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
class AnalyticsTrackController(
    private val analyticsCollectionService: AnalyticsCollectionService,
) {

    @PostMapping("/analytics/page-view")
    fun trackPageView(@RequestBody request: PageViewRequest): ResponseEntity<Void> {
        analyticsCollectionService.recordPageView(
            path = request.path,
            ipAddress = request.ipAddress,
            userAgent = request.userAgent,
            referrer = request.referrer,
            sessionId = request.sessionId,
        )
        return ResponseEntity.ok().build()
    }
}

data class PageViewRequest(
    val path: String,
    val ipAddress: String,
    val userAgent: String?,
    val referrer: String?,
    val sessionId: String?,
)
