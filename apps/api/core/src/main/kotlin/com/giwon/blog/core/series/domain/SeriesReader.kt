package com.giwon.blog.core.series.domain

interface SeriesReader {
    fun findById(id: Long): Series?
    fun findBySlug(slug: String): Series?
    fun findAll(): List<Series>
    fun existsBySlug(slug: String): Boolean
}
