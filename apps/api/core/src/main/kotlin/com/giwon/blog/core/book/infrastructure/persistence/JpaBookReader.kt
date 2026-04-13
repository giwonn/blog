package com.giwon.blog.core.book.infrastructure.persistence

import com.giwon.blog.core.book.domain.Book
import com.giwon.blog.core.book.domain.BookReader
import org.springframework.stereotype.Component

@Component
class JpaBookReader(
    private val bookJpaRepository: BookJpaRepository,
) : BookReader {

    override fun findById(id: Long): Book? {
        return bookJpaRepository.findById(id).orElse(null)
    }

    override fun findBySlug(slug: String): Book? {
        return bookJpaRepository.findBySlug(slug)
    }

    override fun findAll(): List<Book> {
        return bookJpaRepository.findAll()
    }

    override fun existsBySlug(slug: String): Boolean {
        return bookJpaRepository.existsBySlug(slug)
    }
}
