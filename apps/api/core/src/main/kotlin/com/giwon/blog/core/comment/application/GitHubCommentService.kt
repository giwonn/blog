package com.giwon.blog.core.comment.application

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import java.io.Serializable
import org.springframework.beans.factory.annotation.Value
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient

@Service
class GitHubCommentService(
    @Value("\${github.owner:giwonn}") private val owner: String,
    @Value("\${github.repo:giwon-blog}") private val repo: String,
    private val restClient: RestClient = RestClient.builder()
        .baseUrl("https://api.github.com")
        .build(),
) {

    private val objectMapper = jacksonObjectMapper()

    @Cacheable(value = ["comments"], key = "'recent'")
    fun getRecentComments(limit: Int = 5): List<RecentComment> {
        val response = restClient.get()
            .uri("/repos/$owner/$repo/issues/comments?sort=created&direction=desc&per_page=$limit")
            .header("Accept", "application/vnd.github.v3+json")
            .retrieve()
            .body(String::class.java) ?: return emptyList()

        return parseComments(response)
    }

    fun parseComments(json: String): List<RecentComment> {
        val comments: List<Map<String, Any>> = objectMapper.readValue(json)
        return comments.map { comment ->
            val user = comment["user"] as Map<*, *>
            RecentComment(
                body = comment["body"] as String,
                author = user["login"] as String,
                avatarUrl = user["avatar_url"] as String,
                url = comment["html_url"] as String,
                createdAt = comment["created_at"] as String,
            )
        }
    }
}

data class RecentComment(
    val body: String,
    val author: String,
    val avatarUrl: String,
    val url: String,
    val createdAt: String,
) : Serializable {
    companion object {
        private const val serialVersionUID = 1L
    }
}
