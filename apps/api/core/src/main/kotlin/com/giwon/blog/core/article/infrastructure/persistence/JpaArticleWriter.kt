package com.giwon.blog.core.article.infrastructure.persistence

import com.giwon.blog.core.article.domain.Article
import com.giwon.blog.core.article.domain.ArticleWriter
import org.springframework.stereotype.Component

@Component
class JpaArticleWriter(
    private val articleJpaRepository: ArticleJpaRepository,
) : ArticleWriter {

    override fun save(article: Article): Article {
        return articleJpaRepository.save(article)
    }

    override fun delete(article: Article) {
        articleJpaRepository.delete(article)
    }
}
