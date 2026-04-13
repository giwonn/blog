package com.giwon.blog.core.article.application

import com.giwon.blog.common.exception.BusinessException
import com.giwon.blog.common.exception.ErrorCode
import com.giwon.blog.core.article.domain.ArticleNeighborReader
import com.giwon.blog.core.article.domain.ArticleNeighbors
import com.giwon.blog.core.article.domain.ArticleReader
import org.springframework.stereotype.Service

@Service
class NeighborArticleService(
    private val articleReader: ArticleReader,
    private val neighborReader: ArticleNeighborReader,
) {

    fun findNeighbors(slug: String, seriesSlug: String?, bookSlug: String?): ArticleNeighbors {
        val article = articleReader.findBySlug(slug)
            ?: throw BusinessException(ErrorCode.ARTICLE_NOT_FOUND)

        return when {
            seriesSlug != null && article.seriesId != null -> neighborReader.findNeighborsInSeries(article)
            bookSlug != null && article.bookId != null -> neighborReader.findNeighborsInBook(article)
            else -> neighborReader.findNeighborsByPublishedAt(article)
        }
    }
}
