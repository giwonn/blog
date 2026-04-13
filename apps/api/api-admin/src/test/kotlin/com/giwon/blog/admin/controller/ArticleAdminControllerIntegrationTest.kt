package com.giwon.blog.admin.controller

import com.giwon.blog.admin.config.TestContainersConfig
import com.giwon.blog.core.article.domain.Article
import com.giwon.blog.core.article.infrastructure.persistence.ArticleJpaRepository
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfig::class)
class ArticleAdminControllerIntegrationTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var articleJpaRepository: ArticleJpaRepository

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @BeforeEach
    fun setUp() {
        articleJpaRepository.deleteAll()
    }

    @Test
    fun `POST admin_articles - 글을 작성한다`() {
        val request = mapOf("title" to "새 글", "content" to "내용입니다")

        mockMvc.post("/admin/articles") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(request)
        }.andExpect {
            status { isCreated() }
            jsonPath("$.data.title") { value("새 글") }
            jsonPath("$.data.content") { value("내용입니다") }
            jsonPath("$.data.id") { exists() }
        }
    }

    @Test
    fun `POST admin_articles - 제목이 비어있으면 400을 반환한다`() {
        val request = mapOf("title" to "", "content" to "내용")

        mockMvc.post("/admin/articles") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(request)
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `PUT admin_articles_{id} - 글을 수정한다`() {
        val saved = articleJpaRepository.save(Article(title = "원래 제목", content = "원래 내용"))
        val request = mapOf("title" to "수정 제목", "content" to "수정 내용")

        mockMvc.put("/admin/articles/${saved.id}") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(request)
        }.andExpect {
            status { isOk() }
            jsonPath("$.data.title") { value("수정 제목") }
            jsonPath("$.data.content") { value("수정 내용") }
        }
    }

    @Test
    fun `DELETE admin_articles_{id} - 글을 삭제한다`() {
        val saved = articleJpaRepository.save(Article(title = "삭제할 글", content = "내용"))

        mockMvc.delete("/admin/articles/${saved.id}")
            .andExpect {
                status { isNoContent() }
            }

        mockMvc.get("/admin/articles/${saved.id}")
            .andExpect {
                status { isNotFound() }
            }
    }

    @Test
    fun `GET admin_articles - 글 목록을 조회한다`() {
        articleJpaRepository.save(Article(title = "글1", content = "내용1"))
        articleJpaRepository.save(Article(title = "글2", content = "내용2"))

        mockMvc.get("/admin/articles")
            .andExpect {
                status { isOk() }
                jsonPath("$.data.content.length()") { value(2) }
                jsonPath("$.data.page.totalElements") { value(2) }
            }
    }

    @Test
    fun `POST admin_articles - base64 이미지가 포함된 글을 저장하면 URL로 치환된다`() {
        val contentWithBase64 = "텍스트 ![alt](data:image/png;base64,iVBORw0KGgo=) 끝"
        val request = mapOf("title" to "이미지 글", "content" to contentWithBase64)

        val result = mockMvc.post("/admin/articles") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(request)
        }.andExpect {
            status { isCreated() }
        }.andReturn()

        val responseBody = result.response.contentAsString
        assertFalse(responseBody.contains("base64"), "base64가 치환되지 않았습니다")
    }
}
