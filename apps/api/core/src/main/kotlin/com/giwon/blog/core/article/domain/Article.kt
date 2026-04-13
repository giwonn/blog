package com.giwon.blog.core.article.domain

import jakarta.persistence.*
import java.io.Serializable
import java.time.LocalDateTime

@Entity
@Table(name = "articles")
class Article(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0,

    @Column(nullable = false)
    var title: String,

    @Column(nullable = false, columnDefinition = "TEXT")
    var content: String,

    @Column(nullable = false, unique = true)
    var slug: String,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var status: ArticleStatus = ArticleStatus.DRAFT,

    var publishedAt: LocalDateTime? = null,

    var password: String? = null,

    @Column(name = "series_id")
    var seriesId: Long? = null,

    var orderInSeries: Int? = null,

    @Column(name = "book_id")
    var bookId: Long? = null,

    var orderInBook: Int? = null,

    @Column(nullable = false, updatable = false)
    val createdAt: LocalDateTime = LocalDateTime.now(),

    @Column(nullable = false)
    var updatedAt: LocalDateTime = LocalDateTime.now(),
) : Serializable {

    companion object {
        private const val serialVersionUID = 1L
    }

    val isVisibleOnBlog: Boolean get() = status.isVisible
    val isPasswordProtected: Boolean get() = status == ArticleStatus.LOCKED && password != null
}
