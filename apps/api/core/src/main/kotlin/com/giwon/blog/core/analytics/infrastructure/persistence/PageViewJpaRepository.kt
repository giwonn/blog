package com.giwon.blog.core.analytics.infrastructure.persistence

import com.giwon.blog.core.analytics.domain.PageView
import org.springframework.data.jpa.repository.JpaRepository

interface PageViewJpaRepository : JpaRepository<PageView, Long>
