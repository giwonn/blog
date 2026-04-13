package com.giwon.blog.core.book.infrastructure.persistence

import com.giwon.blog.core.book.domain.Book
import org.springframework.data.jpa.repository.JpaRepository

interface BookJpaRepository : JpaRepository<Book, Long> {
    fun findBySlug(slug: String): Book?
    fun existsBySlug(slug: String): Boolean
}
