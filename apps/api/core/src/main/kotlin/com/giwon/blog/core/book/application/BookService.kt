package com.giwon.blog.core.book.application

import com.giwon.blog.common.exception.BusinessException
import com.giwon.blog.common.exception.ErrorCode
import com.giwon.blog.core.book.domain.Book
import com.giwon.blog.core.book.domain.BookReader
import com.giwon.blog.core.book.domain.BookWriter
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import java.time.LocalDateTime

@Service
class BookService(
    private val bookReader: BookReader,
    private val bookWriter: BookWriter,
) {

    fun findAll(): List<Book> {
        return bookReader.findAll()
    }

    fun findById(id: Long): Book {
        return bookReader.findById(id)
            ?: throw BusinessException(ErrorCode.BOOK_NOT_FOUND)
    }

    fun findBySlug(slug: String): Book {
        return bookReader.findBySlug(slug)
            ?: throw BusinessException(ErrorCode.BOOK_NOT_FOUND)
    }

    @Transactional
    fun create(
        title: String,
        slug: String,
        author: String,
        publisher: String? = null,
        thumbnailUrl: String? = null,
        description: String? = null,
        isbn: String? = null,
        readStartDate: LocalDate? = null,
        readEndDate: LocalDate? = null,
        rating: Int? = null,
    ): Book {
        if (bookReader.existsBySlug(slug)) {
            throw BusinessException(ErrorCode.BOOK_SLUG_DUPLICATE)
        }

        val book = Book(
            title = title,
            slug = slug,
            author = author,
            publisher = publisher,
            thumbnailUrl = thumbnailUrl,
            description = description,
            isbn = isbn,
            readStartDate = readStartDate,
            readEndDate = readEndDate,
            rating = rating,
        )

        return bookWriter.save(book)
    }

    @Transactional
    fun update(
        id: Long,
        title: String,
        slug: String,
        author: String,
        publisher: String? = null,
        thumbnailUrl: String? = null,
        description: String? = null,
        isbn: String? = null,
        readStartDate: LocalDate? = null,
        readEndDate: LocalDate? = null,
        rating: Int? = null,
    ): Book {
        val book = bookReader.findById(id)
            ?: throw BusinessException(ErrorCode.BOOK_NOT_FOUND)

        if (slug != book.slug) {
            if (bookReader.existsBySlug(slug)) {
                throw BusinessException(ErrorCode.BOOK_SLUG_DUPLICATE)
            }
        }

        book.title = title
        book.slug = slug
        book.author = author
        book.publisher = publisher
        book.thumbnailUrl = thumbnailUrl
        book.description = description
        book.isbn = isbn
        book.readStartDate = readStartDate
        book.readEndDate = readEndDate
        book.rating = rating
        book.updatedAt = LocalDateTime.now()

        return bookWriter.save(book)
    }

    @Transactional
    fun delete(id: Long) {
        val book = bookReader.findById(id)
            ?: throw BusinessException(ErrorCode.BOOK_NOT_FOUND)

        bookWriter.delete(book)
    }
}
