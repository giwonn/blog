package com.giwon.blog.core.analytics.domain

import jakarta.persistence.*
import java.time.LocalDateTime

@Entity
@Table(name = "article_stats")
class ArticleStats(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(nullable = false, unique = true)
    val articleId: Long,

    @Column(nullable = false)
    val viewCount: Long,

    @Column(nullable = false)
    val aggregatedAt: LocalDateTime = LocalDateTime.now(),
)
