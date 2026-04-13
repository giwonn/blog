package com.giwon.blog.core.book.infrastructure.persistence

import com.giwon.blog.core.book.domain.Book
import com.giwon.blog.core.book.domain.BookWriter
import org.springframework.stereotype.Component

@Component
class JpaBookWriter(
    private val bookJpaRepository: BookJpaRepository,
) : BookWriter {

    override fun save(book: Book): Book {
        return bookJpaRepository.save(book)
    }

    override fun delete(book: Book) {
        bookJpaRepository.delete(book)
    }
}
