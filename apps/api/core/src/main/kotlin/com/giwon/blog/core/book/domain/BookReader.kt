package com.giwon.blog.core.book.domain

interface BookReader {
    fun findById(id: Long): Book?
    fun findBySlug(slug: String): Book?
    fun findAll(): List<Book>
    fun existsBySlug(slug: String): Boolean
}
