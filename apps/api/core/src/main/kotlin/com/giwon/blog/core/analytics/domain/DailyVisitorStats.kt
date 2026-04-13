package com.giwon.blog.core.analytics.domain

import jakarta.persistence.*
import java.time.LocalDate

@Entity
@Table(name = "daily_visitor_stats")
class DailyVisitorStats(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(nullable = false, unique = true)
    val date: LocalDate,

    @Column(nullable = false)
    val visitorCount: Long,
)
