package com.giwon.blog.core.article.domain

enum class ArticleStatus {
    DRAFT,
    PUBLIC,
    LOCKED,
    PRIVATE,
    ;

    val isVisible: Boolean get() = this == PUBLIC || this == LOCKED
}
