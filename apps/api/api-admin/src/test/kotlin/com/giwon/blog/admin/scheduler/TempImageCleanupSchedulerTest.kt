package com.giwon.blog.admin.scheduler

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.FileTime
import java.time.Instant
import java.time.temporal.ChronoUnit

class TempImageCleanupSchedulerTest {

    @TempDir
    lateinit var tempDir: Path

    lateinit var scheduler: TempImageCleanupScheduler

    @BeforeEach
    fun setUp() {
        val tempImageDir = tempDir.resolve("temp")
        Files.createDirectories(tempImageDir)
        scheduler = TempImageCleanupScheduler(tempDir.toString())
    }

    @Test
    fun `cleanup - 24시간 이상 된 temp 이미지를 삭제한다`() {
        val tempImageDir = tempDir.resolve("temp")
        val oldFile = tempImageDir.resolve("old.png")
        Files.write(oldFile, byteArrayOf(1, 2, 3))
        Files.setLastModifiedTime(oldFile, FileTime.from(Instant.now().minus(25, ChronoUnit.HOURS)))

        scheduler.cleanup()

        assertFalse(Files.exists(oldFile))
    }

    @Test
    fun `cleanup - 24시간 미만인 파일은 유지한다`() {
        val tempImageDir = tempDir.resolve("temp")
        val newFile = tempImageDir.resolve("new.png")
        Files.write(newFile, byteArrayOf(1, 2, 3))

        scheduler.cleanup()

        assertTrue(Files.exists(newFile))
    }
}
