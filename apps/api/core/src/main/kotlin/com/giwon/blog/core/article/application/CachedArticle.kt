package com.giwon.blog.core.article.application

import com.giwon.blog.core.article.domain.Article
import com.giwon.blog.core.article.domain.ArticleStatus
import java.time.LocalDateTime

data class CachedArticle(
    val id: Long,
    val title: String,
    val content: String,
    val slug: String,
    val status: ArticleStatus,
    val publishedAt: LocalDateTime?,
    val password: String?,
    val seriesId: Long?,
    val orderInSeries: Int?,
    val bookId: Long?,
    val orderInBook: Int?,
    val createdAt: LocalDateTime,
    val updatedAt: LocalDateTime,
) {
    fun toEntity(): Article = Article(
        id = id,
        title = title,
        content = content,
        slug = slug,
        status = status,
        publishedAt = publishedAt,
        password = password,
        seriesId = seriesId,
        orderInSeries = orderInSeries,
        bookId = bookId,
        orderInBook = orderInBook,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )

    companion object {
        fun from(article: Article): CachedArticle = CachedArticle(
            id = article.id,
            title = article.title,
            content = article.content,
            slug = article.slug,
            status = article.status,
            publishedAt = article.publishedAt,
            password = article.password,
            seriesId = article.seriesId,
            orderInSeries = article.orderInSeries,
            bookId = article.bookId,
            orderInBook = article.orderInBook,
            createdAt = article.createdAt,
            updatedAt = article.updatedAt,
        )
    }
}
