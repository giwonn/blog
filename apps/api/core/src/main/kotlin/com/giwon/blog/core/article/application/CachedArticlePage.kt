package com.giwon.blog.core.article.application

import com.giwon.blog.core.article.domain.Article
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest

data class CachedArticlePage(
    val content: List<CachedArticle>,
    val number: Int,
    val size: Int,
    val totalElements: Long,
) {
    fun toPage(): Page<Article> = PageImpl(
        content.map { it.toEntity() },
        PageRequest.of(number, size),
        totalElements,
    )

    companion object {
        fun from(page: Page<Article>): CachedArticlePage = CachedArticlePage(
            content = page.content.map { CachedArticle.from(it) },
            number = page.number,
            size = page.size,
            totalElements = page.totalElements,
        )
    }
}
