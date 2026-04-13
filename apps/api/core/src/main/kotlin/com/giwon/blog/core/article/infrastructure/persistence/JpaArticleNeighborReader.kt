package com.giwon.blog.core.article.infrastructure.persistence

import com.giwon.blog.core.article.domain.*
import com.giwon.blog.core.article.domain.QArticle
import com.querydsl.jpa.impl.JPAQueryFactory
import org.springframework.stereotype.Component

@Component
class JpaArticleNeighborReader(
    private val queryFactory: JPAQueryFactory,
) : ArticleNeighborReader {

    private val q = QArticle.article
    private val visibleStatuses = listOf(ArticleStatus.PUBLIC, ArticleStatus.LOCKED)

    override fun findNeighborsByPublishedAt(article: Article): ArticleNeighbors {
        val previous = queryFactory
            .select(q)
            .from(q)
            .where(
                q.publishedAt.lt(article.publishedAt),
                q.status.`in`(visibleStatuses),
                q.id.ne(article.id),
            )
            .orderBy(q.publishedAt.desc())
            .limit(1)
            .fetchOne()

        val next = queryFactory
            .select(q)
            .from(q)
            .where(
                q.publishedAt.gt(article.publishedAt),
                q.status.`in`(visibleStatuses),
                q.id.ne(article.id),
            )
            .orderBy(q.publishedAt.asc())
            .limit(1)
            .fetchOne()

        return ArticleNeighbors(
            previous = previous?.toNeighbor(),
            next = next?.toNeighbor(),
        )
    }

    override fun findNeighborsInSeries(article: Article): ArticleNeighbors {
        val previous = queryFactory
            .select(q)
            .from(q)
            .where(
                q.seriesId.eq(article.seriesId),
                q.orderInSeries.lt(article.orderInSeries),
                q.status.`in`(visibleStatuses),
                q.id.ne(article.id),
            )
            .orderBy(q.orderInSeries.desc())
            .limit(1)
            .fetchOne()

        val next = queryFactory
            .select(q)
            .from(q)
            .where(
                q.seriesId.eq(article.seriesId),
                q.orderInSeries.gt(article.orderInSeries),
                q.status.`in`(visibleStatuses),
                q.id.ne(article.id),
            )
            .orderBy(q.orderInSeries.asc())
            .limit(1)
            .fetchOne()

        return ArticleNeighbors(
            previous = previous?.toNeighbor(),
            next = next?.toNeighbor(),
        )
    }

    override fun findNeighborsInBook(article: Article): ArticleNeighbors {
        val previous = queryFactory
            .select(q)
            .from(q)
            .where(
                q.bookId.eq(article.bookId),
                q.orderInBook.lt(article.orderInBook),
                q.status.`in`(visibleStatuses),
                q.id.ne(article.id),
            )
            .orderBy(q.orderInBook.desc())
            .limit(1)
            .fetchOne()

        val next = queryFactory
            .select(q)
            .from(q)
            .where(
                q.bookId.eq(article.bookId),
                q.orderInBook.gt(article.orderInBook),
                q.status.`in`(visibleStatuses),
                q.id.ne(article.id),
            )
            .orderBy(q.orderInBook.asc())
            .limit(1)
            .fetchOne()

        return ArticleNeighbors(
            previous = previous?.toNeighbor(),
            next = next?.toNeighbor(),
        )
    }

    private fun Article.toNeighbor() = ArticleNeighbor(
        id = id,
        title = title,
        slug = slug,
    )
}
