package com.giwon.blog.core.article.domain

import com.giwon.blog.core.image.domain.ImageStorage
import org.springframework.stereotype.Service

@Service
class ArticleDomainService(
    private val imageStorage: ImageStorage,
) {

    private val tempUrlPattern = Regex("""!\[([^\]]*)]\((https?://[^)]*?/temp/[^)]+)\)""")
    private val imageUrlPattern = Regex("""!\[[^\]]*]\((https?://[^)]+)\)""")

    fun processNewImages(content: String, articleId: Long): String {
        return tempUrlPattern.replace(content) { match ->
            val alt = match.groupValues[1]
            val tempUrl = match.groupValues[2]
            val permanentUrl = imageStorage.move(tempUrl, "articles/$articleId")
            "![$alt]($permanentUrl)"
        }
    }

    fun cleanupDeletedImages(oldContent: String, newContent: String) {
        val oldUrls = extractImageUrls(oldContent)
        val newUrls = extractImageUrls(newContent)
        (oldUrls - newUrls).forEach { imageStorage.delete(it) }
    }

    fun cleanupAllImages(content: String) {
        extractImageUrls(content).forEach { imageStorage.delete(it) }
    }

    private fun extractImageUrls(content: String): Set<String> {
        return imageUrlPattern.findAll(content).map { it.groupValues[1] }.toSet()
    }
}
