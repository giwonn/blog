package com.giwon.blog.core.settings.application

import com.giwon.blog.core.settings.domain.BlogConfig
import com.giwon.blog.core.settings.domain.AnalyticsConfig
import com.giwon.blog.core.settings.domain.SiteSettings
import com.giwon.blog.core.settings.domain.SettingsReader
import com.giwon.blog.core.settings.domain.SettingsWriter
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.*

@ExtendWith(MockitoExtension::class)
class SettingsServiceTest {

    @Mock lateinit var settingsReader: SettingsReader
    @Mock lateinit var settingsWriter: SettingsWriter

    lateinit var settingsService: SettingsService

    @BeforeEach
    fun setUp() {
        settingsService = SettingsService(settingsReader, settingsWriter)
    }

    @Test
    fun `getSettings - 설정을 조회한다`() {
        val settings = SiteSettings(
            blog = BlogConfig(name = "Giwon's Blog", description = "개발 블로그"),
            analytics = AnalyticsConfig(trackingEnabled = true),
        )
        whenever(settingsReader.get()).thenReturn(settings)

        val result = settingsService.getSettings()

        assertEquals("Giwon's Blog", result.blog.name)
        assertTrue(result.analytics.trackingEnabled)
    }

    @Test
    fun `getSettings - 설정이 없으면 기본값을 반환한다`() {
        whenever(settingsReader.get()).thenReturn(null)

        val result = settingsService.getSettings()

        assertEquals("Blog", result.blog.name)
        assertEquals("", result.blog.description)
        assertTrue(result.analytics.trackingEnabled)
    }

    @Test
    fun `updateBlogConfig - 블로그 설정을 업데이트한다`() {
        val existing = SiteSettings(
            blog = BlogConfig(name = "Old", description = "Old desc"),
            analytics = AnalyticsConfig(trackingEnabled = true),
        )
        whenever(settingsReader.get()).thenReturn(existing)

        settingsService.updateBlogConfig(BlogConfig(name = "New", description = "New desc"))

        verify(settingsWriter).save(argThat<SiteSettings> { settings ->
            settings.blog.name == "New" && settings.blog.description == "New desc" &&
                settings.analytics.trackingEnabled // analytics는 변경 안 됨
        })
    }

    @Test
    fun `updateAnalyticsConfig - 분석 설정을 업데이트한다`() {
        val existing = SiteSettings(
            blog = BlogConfig(name = "Blog", description = "desc"),
            analytics = AnalyticsConfig(trackingEnabled = true),
        )
        whenever(settingsReader.get()).thenReturn(existing)

        settingsService.updateAnalyticsConfig(AnalyticsConfig(trackingEnabled = false))

        verify(settingsWriter).save(argThat<SiteSettings> { settings ->
            !settings.analytics.trackingEnabled &&
                settings.blog.name == "Blog" // blog는 변경 안 됨
        })
    }
}
