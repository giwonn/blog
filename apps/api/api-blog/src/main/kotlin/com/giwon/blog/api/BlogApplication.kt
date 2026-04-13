package com.giwon.blog.api

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.autoconfigure.domain.EntityScan
import org.springframework.boot.runApplication
import org.springframework.data.jpa.repository.config.EnableJpaRepositories
import org.springframework.scheduling.annotation.EnableAsync
import org.springframework.scheduling.annotation.EnableScheduling

@EnableAsync
@EnableScheduling
@EnableJpaRepositories(basePackages = ["com.giwon.blog"])
@EntityScan(basePackages = ["com.giwon.blog"])
@SpringBootApplication(scanBasePackages = ["com.giwon.blog"])
class BlogApplication

fun main(args: Array<String>) {
    runApplication<BlogApplication>(*args)
}
