package com.giwon.blog.core.batch.domain

import java.time.LocalDate

interface BatchJobLogger {
    fun start(jobName: String, targetDate: LocalDate? = null): BatchJobLog
    fun save(log: BatchJobLog): BatchJobLog
}
