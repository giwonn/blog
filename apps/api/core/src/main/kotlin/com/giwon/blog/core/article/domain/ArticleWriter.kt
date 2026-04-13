package com.giwon.blog.core.article.domain

interface ArticleWriter {
    fun save(article: Article): Article
    fun delete(article: Article)
}
