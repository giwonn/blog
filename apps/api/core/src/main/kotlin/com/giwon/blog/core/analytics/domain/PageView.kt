package com.giwon.blog.core.analytics.domain

import jakarta.persistence.*
import java.time.LocalDateTime

@Entity
@Table(name = "page_views")
class PageView(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(nullable = false)
    val path: String,

    @Column(nullable = false)
    val ipAddress: String,

    val userAgent: String? = null,

    val referrer: String? = null,

    val sessionId: String? = null,

    val latitude: Double? = null,

    val longitude: Double? = null,

    val country: String? = null,

    val city: String? = null,

    @Column(nullable = false, updatable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),
)
