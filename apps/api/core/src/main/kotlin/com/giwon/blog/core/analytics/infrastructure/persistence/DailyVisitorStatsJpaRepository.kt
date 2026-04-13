package com.giwon.blog.core.analytics.infrastructure.persistence

import com.giwon.blog.core.analytics.domain.DailyVisitorStats
import org.springframework.data.jpa.repository.JpaRepository

interface DailyVisitorStatsJpaRepository : JpaRepository<DailyVisitorStats, Long>
