package com.giwon.blog.api.controller

import com.giwon.blog.common.dto.ApiResponse
import com.giwon.blog.core.article.domain.Article
import com.giwon.blog.core.article.domain.ArticleReader
import com.giwon.blog.core.book.application.BookService
import com.giwon.blog.core.book.domain.Book
import org.springframework.web.bind.annotation.*

data class BookWithArticleCount(
    val id: Long,
    val title: String,
    val slug: String,
    val author: String,
    val thumbnailUrl: String?,
    val rating: Int?,
    val articleCount: Int,
)

data class BookDetailResponse(
    val book: Book,
    val articles: List<Article>,
)

@RestController
@RequestMapping("/books")
class BookController(
    private val bookService: BookService,
    private val articleReader: ArticleReader,
) {

    @GetMapping
    fun findAll(): ApiResponse<List<BookWithArticleCount>> {
        val allBooks = bookService.findAll()
        val result = allBooks.map { book ->
            val articles = articleReader.findVisibleByBookId(book.id)
            BookWithArticleCount(
                id = book.id,
                title = book.title,
                slug = book.slug,
                author = book.author,
                thumbnailUrl = book.thumbnailUrl,
                rating = book.rating,
                articleCount = articles.size,
            )
        }
        return ApiResponse(result)
    }

    @GetMapping("/{slug}")
    fun findBySlug(@PathVariable slug: String): ApiResponse<BookDetailResponse> {
        val book = bookService.findBySlug(slug)
        val articles = articleReader.findVisibleByBookId(book.id)
        return ApiResponse(BookDetailResponse(book = book, articles = articles))
    }
}
