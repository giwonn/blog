package com.giwon.blog.admin.scheduler

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.TaskScheduler
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler
import org.springframework.scheduling.support.CronTrigger
import org.springframework.stereotype.Component
import jakarta.annotation.PostConstruct
import java.nio.file.Files
import java.nio.file.Paths
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlin.io.path.getLastModifiedTime

@Component
class TempImageCleanupScheduler(
    @Value("\${image.storage.path:/data/blog/images}") private val storagePath: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @PostConstruct
    fun init() {
        val scheduler: TaskScheduler = ThreadPoolTaskScheduler().apply {
            poolSize = 1
            setThreadNamePrefix("temp-cleanup-")
            initialize()
        }
        scheduler.schedule(::cleanup, CronTrigger("0 0 * * * *"))
    }

    fun cleanup() {
        val tempDir = Paths.get(storagePath, "temp")
        if (!Files.exists(tempDir)) return

        val cutoff = Instant.now().minus(24, ChronoUnit.HOURS)
        var deletedCount = 0

        Files.list(tempDir).use { stream ->
            stream.filter { Files.isRegularFile(it) }
                .filter { it.getLastModifiedTime().toInstant().isBefore(cutoff) }
                .forEach { file ->
                    Files.deleteIfExists(file)
                    deletedCount++
                }
        }

        if (deletedCount > 0) {
            log.info("고아 temp 이미지 {}개 삭제됨", deletedCount)
        }
    }
}
