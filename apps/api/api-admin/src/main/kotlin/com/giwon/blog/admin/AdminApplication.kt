package com.giwon.blog.admin

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.autoconfigure.domain.EntityScan
import org.springframework.boot.runApplication
import org.springframework.data.jpa.repository.config.EnableJpaRepositories
@EnableJpaRepositories(basePackages = ["com.giwon.blog"])
@EntityScan(basePackages = ["com.giwon.blog"])
@SpringBootApplication(scanBasePackages = ["com.giwon.blog"])
class AdminApplication

fun main(args: Array<String>) {
    runApplication<AdminApplication>(*args)
}
