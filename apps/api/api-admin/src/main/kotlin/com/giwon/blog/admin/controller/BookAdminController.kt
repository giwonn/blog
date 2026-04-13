package com.giwon.blog.admin.controller

import com.giwon.blog.common.dto.ApiResponse
import com.giwon.blog.core.article.application.ArticleService
import com.giwon.blog.core.article.domain.Article
import com.giwon.blog.core.article.domain.ArticleReader
import com.giwon.blog.core.book.application.BookService
import com.giwon.blog.core.book.domain.Book
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.*
import java.time.LocalDate

@RestController
@RequestMapping("/admin/books")
class BookAdminController(
    private val bookService: BookService,
    private val articleReader: ArticleReader,
    private val articleService: ArticleService,
) {

    @GetMapping
    fun findAll(): ApiResponse<List<Book>> {
        return ApiResponse(bookService.findAll())
    }

    @GetMapping("/{id}")
    fun findById(@PathVariable id: Long): ApiResponse<BookAdminDetail> {
        val book = bookService.findById(id)
        val articles = articleReader.findAllByBookId(id).sortedBy { it.orderInBook }
        return ApiResponse(BookAdminDetail(book, articles))
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@Valid @RequestBody request: BookRequest): ApiResponse<Book> {
        return ApiResponse(bookService.create(
            title = request.title,
            slug = request.slug,
            author = request.author,
            publisher = request.publisher,
            thumbnailUrl = request.thumbnailUrl,
            description = request.description,
            isbn = request.isbn,
            readStartDate = request.readStartDate,
            readEndDate = request.readEndDate,
            rating = request.rating,
        ))
    }

    @PutMapping("/{id}")
    fun update(@PathVariable id: Long, @Valid @RequestBody request: BookRequest): ApiResponse<Book> {
        return ApiResponse(bookService.update(
            id = id,
            title = request.title,
            slug = request.slug,
            author = request.author,
            publisher = request.publisher,
            thumbnailUrl = request.thumbnailUrl,
            description = request.description,
            isbn = request.isbn,
            readStartDate = request.readStartDate,
            readEndDate = request.readEndDate,
            rating = request.rating,
        ))
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: Long) {
        bookService.delete(id)
    }

    @PutMapping("/{id}/article-order")
    fun updateArticleOrder(
        @PathVariable id: Long,
        @RequestBody request: ArticleOrderRequest,
    ): ApiResponse<String> {
        bookService.findById(id)

        request.articleIds.forEachIndexed { index, articleId ->
            val article = articleService.findById(articleId)
            articleService.update(
                id = articleId,
                title = article.title,
                content = article.content,
                slug = article.slug,
                status = article.status,
                password = article.password,
                seriesId = article.seriesId,
                orderInSeries = article.orderInSeries,
                bookId = id,
                orderInBook = index + 1,
            )
        }

        return ApiResponse("Article order updated successfully")
    }
}

data class BookRequest(
    @field:NotBlank val title: String,
    @field:NotBlank val slug: String,
    @field:NotBlank val author: String,
    val publisher: String? = null,
    val thumbnailUrl: String? = null,
    val description: String? = null,
    val isbn: String? = null,
    val readStartDate: LocalDate? = null,
    val readEndDate: LocalDate? = null,
    val rating: Int? = null,
)

data class BookAdminDetail(
    val book: Book,
    val articles: List<Article>,
)
