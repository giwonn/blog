package com.giwon.blog.core.analytics.infrastructure.persistence

import com.giwon.blog.core.analytics.domain.DailyArticleStats
import org.springframework.data.jpa.repository.JpaRepository

interface DailyArticleStatsJpaRepository : JpaRepository<DailyArticleStats, Long>
