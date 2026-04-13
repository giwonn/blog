package com.giwon.blog.core.article.domain

data class ArticleNeighbor(val id: Long, val title: String, val slug: String)
data class ArticleNeighbors(val previous: ArticleNeighbor?, val next: ArticleNeighbor?)

interface ArticleNeighborReader {
    fun findNeighborsByPublishedAt(article: Article): ArticleNeighbors
    fun findNeighborsInSeries(article: Article): ArticleNeighbors
    fun findNeighborsInBook(article: Article): ArticleNeighbors
}
