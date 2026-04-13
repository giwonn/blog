package com.giwon.blog.core.analytics.application

import com.giwon.blog.core.analytics.domain.AnalyticsWriter
import com.giwon.blog.core.analytics.domain.GeoLocationResolver
import com.giwon.blog.core.analytics.domain.PageView
import com.giwon.blog.core.analytics.domain.VisitorCounter
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

@Service
class AnalyticsCollectionService(
    private val analyticsWriter: AnalyticsWriter,
    private val geoLocationResolver: GeoLocationResolver,
    private val visitorCounter: VisitorCounter,
) {

    @Async
    @Transactional
    fun recordPageView(
        path: String,
        ipAddress: String,
        userAgent: String?,
        referrer: String?,
        sessionId: String?,
    ) {
        val geo = geoLocationResolver.resolve(ipAddress)

        val pageView = PageView(
            path = path,
            ipAddress = ipAddress,
            userAgent = userAgent,
            referrer = referrer,
            sessionId = sessionId,
            latitude = geo?.latitude,
            longitude = geo?.longitude,
            country = geo?.country,
            city = geo?.city,
        )
        analyticsWriter.savePageView(pageView)

        if (sessionId != null) {
            analyticsWriter.upsertSession(sessionId, ipAddress, userAgent)
            visitorCounter.addVisitor(LocalDate.now(), sessionId)
        }
    }
}
