package com.giwon.blog.core.analytics.infrastructure.persistence

import com.giwon.blog.core.analytics.domain.VisitorSession
import org.springframework.data.jpa.repository.JpaRepository
import java.util.*

interface VisitorSessionJpaRepository : JpaRepository<VisitorSession, Long> {
    fun findBySessionId(sessionId: String): Optional<VisitorSession>
}
