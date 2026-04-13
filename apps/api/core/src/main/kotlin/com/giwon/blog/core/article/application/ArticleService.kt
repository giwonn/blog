package com.giwon.blog.core.article.application

import com.giwon.blog.common.exception.BusinessException
import com.giwon.blog.common.exception.ErrorCode
import com.giwon.blog.core.article.domain.*
import org.springframework.cache.CacheManager
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime

@Service
class ArticleService(
    private val articleReader: ArticleReader,
    private val articleWriter: ArticleWriter,
    private val articleDomainService: ArticleDomainService,
    private val cacheManager: CacheManager,
) {

    companion object {
        private const val CACHE_ARTICLES = "articles"
        private const val CACHE_ARTICLE_LIST = "articleList"
    }

    // --- 블로그용 조회 ---

    fun findVisibleOnBlog(pageable: Pageable): Page<Article> {
        val cache = cacheManager.getCache(CACHE_ARTICLE_LIST)
        val key = pageable.toString()

        val cached = cache?.get(key, CachedArticlePage::class.java)
        if (cached != null) return cached.toPage()

        val result = articleReader.findVisibleOnBlog(pageable)
        cache?.put(key, CachedArticlePage.from(result))
        return result
    }

    fun findBySlugForBlog(slug: String, password: String?): Article {
        val article = articleReader.findBySlug(slug)
            ?: throw BusinessException(ErrorCode.ARTICLE_NOT_FOUND)

        if (!article.isVisibleOnBlog) {
            throw BusinessException(ErrorCode.ARTICLE_NOT_FOUND)
        }
        if (article.isPasswordProtected) {
            if (password == null) {
                throw BusinessException(ErrorCode.ARTICLE_PASSWORD_REQUIRED)
            }
            if (article.password != password) {
                throw BusinessException(ErrorCode.ARTICLE_PASSWORD_INCORRECT)
            }
        }

        return article
    }

    fun findVisibleByFilter(filter: String, pageable: Pageable): Page<Article> {
        return articleReader.findVisibleByFilter(filter, pageable)
    }

    // --- 어드민용 조회 ---

    fun findAll(pageable: Pageable): Page<Article> {
        return articleReader.findAll(pageable)
    }

    fun findById(id: Long): Article {
        val cache = cacheManager.getCache(CACHE_ARTICLES)

        val cached = cache?.get(id, CachedArticle::class.java)
        if (cached != null) return cached.toEntity()

        val article = articleReader.findById(id)
            ?: throw BusinessException(ErrorCode.ARTICLE_NOT_FOUND)

        if (article.isVisibleOnBlog) {
            cache?.put(id, CachedArticle.from(article))
        }
        return article
    }

    // --- 쓰기 ---

    @Transactional
    fun create(
        title: String,
        content: String,
        slug: String,
        status: ArticleStatus,
        password: String? = null,
        seriesId: Long? = null,
        orderInSeries: Int? = null,
        bookId: Long? = null,
        orderInBook: Int? = null,
    ): Article {
        if (articleReader.existsBySlug(slug)) {
            throw BusinessException(ErrorCode.ARTICLE_SLUG_DUPLICATE)
        }

        val publishedAt = if (status.isVisible) {
            LocalDateTime.now()
        } else {
            null
        }

        val article = Article(
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
        )
        val saved = articleWriter.save(article)

        val processedContent = articleDomainService.processNewImages(saved.content, saved.id)
        if (processedContent != saved.content) {
            saved.content = processedContent
            articleWriter.save(saved)
        }

        if (saved.isVisibleOnBlog) {
            cacheManager.getCache(CACHE_ARTICLES)?.put(saved.id, CachedArticle.from(saved))
            cacheManager.getCache(CACHE_ARTICLE_LIST)?.clear()
        }

        return saved
    }

    @Transactional
    fun update(
        id: Long,
        title: String,
        content: String,
        slug: String,
        status: ArticleStatus,
        password: String? = null,
        seriesId: Long? = null,
        orderInSeries: Int? = null,
        bookId: Long? = null,
        orderInBook: Int? = null,
    ): Article {
        val article = articleReader.findById(id)
            ?: throw BusinessException(ErrorCode.ARTICLE_NOT_FOUND)

        // slug 변경 시 중복 체크
        if (slug != article.slug) {
            if (articleReader.existsBySlug(slug)) {
                throw BusinessException(ErrorCode.ARTICLE_SLUG_DUPLICATE)
            }
        }

        val processedContent = articleDomainService.processNewImages(content, id)
        articleDomainService.cleanupDeletedImages(article.content, processedContent)

        // DRAFT → PUBLIC/LOCKED 전환 시 publishedAt 설정
        val wasNotVisible = !article.isVisibleOnBlog
        val willBeVisible = status.isVisible

        article.title = title
        article.content = processedContent
        article.slug = slug
        article.status = status
        article.password = password
        article.seriesId = seriesId
        article.orderInSeries = orderInSeries
        article.bookId = bookId
        article.orderInBook = orderInBook
        article.updatedAt = LocalDateTime.now()

        if (wasNotVisible && willBeVisible && article.publishedAt == null) {
            article.publishedAt = LocalDateTime.now()
        }

        val saved = articleWriter.save(article)

        if (saved.isVisibleOnBlog) {
            cacheManager.getCache(CACHE_ARTICLES)?.put(id, CachedArticle.from(saved))
        } else {
            cacheManager.getCache(CACHE_ARTICLES)?.evict(id)
        }
        cacheManager.getCache(CACHE_ARTICLE_LIST)?.clear()

        return saved
    }

    @Transactional
    fun delete(id: Long) {
        val article = articleReader.findById(id)
            ?: throw BusinessException(ErrorCode.ARTICLE_NOT_FOUND)

        articleDomainService.cleanupAllImages(article.content)
        articleWriter.delete(article)

        cacheManager.getCache(CACHE_ARTICLES)?.evict(id)
        cacheManager.getCache(CACHE_ARTICLE_LIST)?.clear()
    }
}
