package com.giwon.blog.core.analytics.infrastructure.redis

import com.giwon.blog.core.analytics.domain.VisitorCounter
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import java.time.LocalDate
import java.time.ZoneId

@Component
class RedisVisitorCounter(
    private val redisTemplate: StringRedisTemplate,
) : VisitorCounter {

    override fun addVisitor(date: LocalDate, sessionId: String): Boolean {
        val key = "visitors:$date"
        val added = redisTemplate.opsForSet().add(key, sessionId)

        // 모레 자정에 만료 (어제 방문자로 표시될 때까지 유지)
        val expireAt = date.plusDays(2).atStartOfDay(ZoneId.systemDefault()).toInstant()
        redisTemplate.expireAt(key, expireAt)

        return added != null && added > 0
    }

    override fun getVisitorCount(date: LocalDate): Long {
        val key = "visitors:$date"
        return redisTemplate.opsForSet().size(key) ?: 0L
    }
}
