package com.giwon.blog.core.batch.infrastructure.persistence

import com.giwon.blog.core.batch.domain.BatchJobLog
import com.giwon.blog.core.batch.domain.BatchJobLogger
import com.giwon.blog.core.batch.domain.BatchJobStatus
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate

@Component
class JpaBatchJobLogger(
    private val batchJobLogJpaRepository: BatchJobLogJpaRepository,
) : BatchJobLogger {

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    override fun start(jobName: String, targetDate: LocalDate?): BatchJobLog {
        return batchJobLogJpaRepository.save(
            BatchJobLog(jobName = jobName, targetDate = targetDate)
        )
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    override fun save(log: BatchJobLog): BatchJobLog {
        return batchJobLogJpaRepository.save(log)
    }
}
