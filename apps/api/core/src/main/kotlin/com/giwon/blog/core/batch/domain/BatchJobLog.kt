package com.giwon.blog.core.batch.domain

import jakarta.persistence.*
import java.time.LocalDate
import java.time.LocalDateTime

@Entity
@Table(name = "batch_job_log")
class BatchJobLog(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(nullable = false, length = 100)
    val jobName: String,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    var status: BatchJobStatus = BatchJobStatus.PENDING,

    @Column(nullable = false)
    val startedAt: LocalDateTime = LocalDateTime.now(),

    var finishedAt: LocalDateTime? = null,

    @Column(columnDefinition = "TEXT")
    var errorMessage: String? = null,

    val targetDate: LocalDate? = null,
) {
    fun success() {
        status = BatchJobStatus.SUCCESS
        finishedAt = LocalDateTime.now()
    }

    fun fail(message: String) {
        status = BatchJobStatus.FAIL
        finishedAt = LocalDateTime.now()
        errorMessage = message
    }
}
