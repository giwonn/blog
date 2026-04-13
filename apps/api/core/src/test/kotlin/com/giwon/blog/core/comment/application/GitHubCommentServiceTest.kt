package com.giwon.blog.core.comment.application

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.junit.jupiter.MockitoExtension
import org.springframework.web.client.RestClient

@ExtendWith(MockitoExtension::class)
class GitHubCommentServiceTest {

    lateinit var gitHubCommentService: GitHubCommentService

    @BeforeEach
    fun setUp() {
        gitHubCommentService = GitHubCommentService(
            owner = "giwonn",
            repo = "giwon-blog",
            restClient = RestClient.builder().build(),
        )
    }

    @Test
    fun `getRecentComments - 파싱 로직 테스트`() {
        val jsonResponse = """
        [
            {
                "body": "좋은 글이네요!",
                "user": {"login": "user1", "avatar_url": "https://avatar.com/1"},
                "created_at": "2026-04-01T10:00:00Z",
                "html_url": "https://github.com/giwonn/giwon-blog/issues/1#issuecomment-1"
            },
            {
                "body": "감사합니다",
                "user": {"login": "user2", "avatar_url": "https://avatar.com/2"},
                "created_at": "2026-04-02T10:00:00Z",
                "html_url": "https://github.com/giwonn/giwon-blog/issues/2#issuecomment-2"
            }
        ]
        """.trimIndent()

        val comments = gitHubCommentService.parseComments(jsonResponse)

        assertEquals(2, comments.size)
        assertEquals("좋은 글이네요!", comments[0].body)
        assertEquals("user1", comments[0].author)
    }

    @Test
    fun `parseComments - 빈 응답이면 빈 리스트를 반환한다`() {
        val comments = gitHubCommentService.parseComments("[]")
        assertTrue(comments.isEmpty())
    }
}
