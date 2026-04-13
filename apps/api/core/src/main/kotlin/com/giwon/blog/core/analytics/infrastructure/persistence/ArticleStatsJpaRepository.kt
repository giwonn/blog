package com.giwon.blog.core.analytics.infrastructure.persistence

import com.giwon.blog.core.analytics.domain.ArticleStats
import org.springframework.data.jpa.repository.JpaRepository

interface ArticleStatsJpaRepository : JpaRepository<ArticleStats, Long>
