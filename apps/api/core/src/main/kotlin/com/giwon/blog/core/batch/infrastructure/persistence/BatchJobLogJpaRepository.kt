package com.giwon.blog.core.batch.infrastructure.persistence

import com.giwon.blog.core.batch.domain.BatchJobLog
import org.springframework.data.jpa.repository.JpaRepository

interface BatchJobLogJpaRepository : JpaRepository<BatchJobLog, Long>
