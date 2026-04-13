package com.giwon.blog.core.article.infrastructure.persistence

import com.giwon.blog.core.article.domain.Article
import com.giwon.blog.core.article.domain.ArticleReader
import com.giwon.blog.core.article.domain.ArticleStatus
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.stereotype.Component

@Component
class JpaArticleReader(
    private val articleJpaRepository: ArticleJpaRepository,
) : ArticleReader {

    companion object {
        private val VISIBLE_STATUSES = listOf(ArticleStatus.PUBLIC, ArticleStatus.LOCKED)
    }

    override fun findById(id: Long): Article? {
        return articleJpaRepository.findById(id).orElse(null)
    }

    override fun findBySlug(slug: String): Article? {
        return articleJpaRepository.findBySlug(slug)
    }

    override fun existsBySlug(slug: String): Boolean {
        return articleJpaRepository.existsBySlug(slug)
    }

    override fun findAll(pageable: Pageable): Page<Article> {
        return articleJpaRepository.findAll(pageable)
    }

    override fun findVisibleOnBlog(pageable: Pageable): Page<Article> {
        return articleJpaRepository.findAllByStatusIn(VISIBLE_STATUSES, pageable)
    }

    override fun findVisibleBySeriesId(seriesId: Long): List<Article> {
        return articleJpaRepository.findAllByStatusInAndSeriesId(VISIBLE_STATUSES, seriesId)
    }

    override fun findVisibleByBookId(bookId: Long): List<Article> {
        return articleJpaRepository.findAllByStatusInAndBookId(VISIBLE_STATUSES, bookId)
    }

    override fun findAllBySeriesId(seriesId: Long): List<Article> {
        return articleJpaRepository.findAllBySeriesId(seriesId)
    }

    override fun findAllByBookId(bookId: Long): List<Article> {
        return articleJpaRepository.findAllByBookId(bookId)
    }

    override fun findVisibleByFilter(filter: String, pageable: Pageable): Page<Article> {
        return when (filter) {
            "series" -> articleJpaRepository.findAllByStatusInAndSeriesIdNotNull(VISIBLE_STATUSES, pageable)
            "book" -> articleJpaRepository.findAllByStatusInAndBookIdNotNull(VISIBLE_STATUSES, pageable)
            "standalone" -> articleJpaRepository.findAllByStatusInAndSeriesIdIsNullAndBookIdIsNull(VISIBLE_STATUSES, pageable)
            else -> articleJpaRepository.findAllByStatusIn(VISIBLE_STATUSES, pageable)
        }
    }
}
