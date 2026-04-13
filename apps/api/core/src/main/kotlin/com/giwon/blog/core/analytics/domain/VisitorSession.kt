package com.giwon.blog.core.analytics.domain

import jakarta.persistence.*
import java.time.LocalDateTime

@Entity
@Table(name = "visitor_sessions")
class VisitorSession(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(nullable = false, unique = true)
    val sessionId: String,

    @Column(nullable = false)
    val ipAddress: String,

    val userAgent: String? = null,

    @Column(nullable = false, updatable = false)
    val firstVisitAt: LocalDateTime = LocalDateTime.now(),

    @Column(nullable = false)
    var lastVisitAt: LocalDateTime = LocalDateTime.now(),

    @Column(nullable = false)
    var pageViewCount: Int = 1,
)
