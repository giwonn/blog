package com.giwon.blog.core.analytics.domain

import jakarta.persistence.*
import java.time.LocalDate

@Entity
@Table(
    name = "daily_article_stats",
    uniqueConstraints = [UniqueConstraint(columnNames = ["date", "articleId"])]
)
class DailyArticleStats(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(nullable = false)
    val date: LocalDate,

    @Column(nullable = false)
    val articleId: Long,

    @Column(nullable = false)
    val viewCount: Long,
)
