package com.giwon.blog.core.book.application

import com.giwon.blog.common.exception.BusinessException
import com.giwon.blog.common.exception.ErrorCode
import com.giwon.blog.core.book.domain.Book
import com.giwon.blog.core.book.domain.BookReader
import com.giwon.blog.core.book.domain.BookWriter
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.*
import java.time.LocalDate

class BookServiceTest {

    private lateinit var bookReader: BookReader
    private lateinit var bookWriter: BookWriter
    private lateinit var bookService: BookService

    @BeforeEach
    fun setUp() {
        bookReader = mock()
        bookWriter = mock()
        bookService = BookService(bookReader, bookWriter)
    }

    @Test
    fun `findAll - 모든 책을 반환한다`() {
        val books = listOf(
            Book(id = 1, title = "Clean Code", slug = "clean-code", author = "Robert C. Martin"),
            Book(id = 2, title = "Refactoring", slug = "refactoring", author = "Martin Fowler"),
        )
        whenever(bookReader.findAll()).thenReturn(books)

        val result = bookService.findAll()

        assertEquals(2, result.size)
        verify(bookReader).findAll()
    }

    @Test
    fun `findById - 존재하는 ID로 책을 찾는다`() {
        val book = Book(id = 1, title = "Clean Code", slug = "clean-code", author = "Robert C. Martin")
        whenever(bookReader.findById(1)).thenReturn(book)

        val result = bookService.findById(1)

        assertEquals("Clean Code", result.title)
        verify(bookReader).findById(1)
    }

    @Test
    fun `findById - 존재하지 않는 ID로 예외를 던진다`() {
        whenever(bookReader.findById(999)).thenReturn(null)

        val exception = assertThrows<BusinessException> {
            bookService.findById(999)
        }

        assertEquals(ErrorCode.BOOK_NOT_FOUND, exception.errorCode)
    }

    @Test
    fun `findBySlug - 존재하는 slug로 책을 찾는다`() {
        val book = Book(id = 1, title = "Clean Code", slug = "clean-code", author = "Robert C. Martin")
        whenever(bookReader.findBySlug("clean-code")).thenReturn(book)

        val result = bookService.findBySlug("clean-code")

        assertEquals("Clean Code", result.title)
        verify(bookReader).findBySlug("clean-code")
    }

    @Test
    fun `findBySlug - 존재하지 않는 slug로 예외를 던진다`() {
        whenever(bookReader.findBySlug("nonexistent")).thenReturn(null)

        val exception = assertThrows<BusinessException> {
            bookService.findBySlug("nonexistent")
        }

        assertEquals(ErrorCode.BOOK_NOT_FOUND, exception.errorCode)
    }

    @Test
    fun `create - 새 책을 생성한다`() {
        whenever(bookReader.existsBySlug("clean-code")).thenReturn(false)
        whenever(bookWriter.save(any())).thenAnswer { it.arguments[0] }

        val result = bookService.create(
            title = "Clean Code",
            slug = "clean-code",
            author = "Robert C. Martin",
            publisher = "Prentice Hall",
            thumbnailUrl = "https://example.com/cover.jpg",
            description = "A handbook of agile software craftsmanship",
            isbn = "9780132350884",
            readStartDate = LocalDate.of(2024, 1, 1),
            readEndDate = LocalDate.of(2024, 2, 1),
            rating = 5,
        )

        assertEquals("Clean Code", result.title)
        assertEquals("clean-code", result.slug)
        assertEquals("Robert C. Martin", result.author)
        assertEquals("Prentice Hall", result.publisher)
        assertEquals("9780132350884", result.isbn)
        assertEquals(5, result.rating)
        verify(bookReader).existsBySlug("clean-code")
        verify(bookWriter).save(any())
    }

    @Test
    fun `create - 중복 slug로 예외를 던진다`() {
        whenever(bookReader.existsBySlug("clean-code")).thenReturn(true)

        val exception = assertThrows<BusinessException> {
            bookService.create(
                title = "Clean Code",
                slug = "clean-code",
                author = "Robert C. Martin",
            )
        }

        assertEquals(ErrorCode.BOOK_SLUG_DUPLICATE, exception.errorCode)
        verify(bookWriter, never()).save(any())
    }

    @Test
    fun `update - 기존 책을 수정한다`() {
        val book = Book(id = 1, title = "Clean Code", slug = "clean-code", author = "Robert C. Martin")
        whenever(bookReader.findById(1)).thenReturn(book)
        whenever(bookWriter.save(any())).thenAnswer { it.arguments[0] }

        val result = bookService.update(
            id = 1,
            title = "Clean Code 2nd Edition",
            slug = "clean-code",
            author = "Robert C. Martin",
            publisher = "Prentice Hall",
            thumbnailUrl = null,
            description = "Updated edition",
            isbn = null,
            readStartDate = null,
            readEndDate = null,
            rating = 4,
        )

        assertEquals("Clean Code 2nd Edition", result.title)
        assertEquals("clean-code", result.slug)
        assertEquals(4, result.rating)
        verify(bookWriter).save(any())
    }

    @Test
    fun `update - slug 변경 시 중복 확인한다`() {
        val book = Book(id = 1, title = "Clean Code", slug = "clean-code", author = "Robert C. Martin")
        whenever(bookReader.findById(1)).thenReturn(book)
        whenever(bookReader.existsBySlug("new-slug")).thenReturn(false)
        whenever(bookWriter.save(any())).thenAnswer { it.arguments[0] }

        val result = bookService.update(
            id = 1,
            title = "Clean Code",
            slug = "new-slug",
            author = "Robert C. Martin",
        )

        assertEquals("new-slug", result.slug)
        verify(bookReader).existsBySlug("new-slug")
    }

    @Test
    fun `update - slug 변경 시 중복이면 예외를 던진다`() {
        val book = Book(id = 1, title = "Clean Code", slug = "clean-code", author = "Robert C. Martin")
        whenever(bookReader.findById(1)).thenReturn(book)
        whenever(bookReader.existsBySlug("existing-slug")).thenReturn(true)

        val exception = assertThrows<BusinessException> {
            bookService.update(
                id = 1,
                title = "Clean Code",
                slug = "existing-slug",
                author = "Robert C. Martin",
            )
        }

        assertEquals(ErrorCode.BOOK_SLUG_DUPLICATE, exception.errorCode)
        verify(bookWriter, never()).save(any())
    }

    @Test
    fun `update - 존재하지 않는 ID로 예외를 던진다`() {
        whenever(bookReader.findById(999)).thenReturn(null)

        val exception = assertThrows<BusinessException> {
            bookService.update(
                id = 999,
                title = "Clean Code",
                slug = "clean-code",
                author = "Robert C. Martin",
            )
        }

        assertEquals(ErrorCode.BOOK_NOT_FOUND, exception.errorCode)
    }

    @Test
    fun `delete - 존재하는 책을 삭제한다`() {
        val book = Book(id = 1, title = "Clean Code", slug = "clean-code", author = "Robert C. Martin")
        whenever(bookReader.findById(1)).thenReturn(book)

        bookService.delete(1)

        verify(bookWriter).delete(book)
    }

    @Test
    fun `delete - 존재하지 않는 ID로 예외를 던진다`() {
        whenever(bookReader.findById(999)).thenReturn(null)

        val exception = assertThrows<BusinessException> {
            bookService.delete(999)
        }

        assertEquals(ErrorCode.BOOK_NOT_FOUND, exception.errorCode)
        verify(bookWriter, never()).delete(any())
    }
}
