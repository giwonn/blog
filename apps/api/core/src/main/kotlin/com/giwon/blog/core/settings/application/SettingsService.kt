package com.giwon.blog.core.settings.application

import com.giwon.blog.core.settings.domain.*
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class SettingsService(
    private val settingsReader: SettingsReader,
    private val settingsWriter: SettingsWriter,
) {

    fun getSettings(): SiteSettings {
        return settingsReader.get() ?: SiteSettings()
    }

    @Transactional
    fun updateBlogConfig(blogConfig: BlogConfig) {
        val current = getSettings()
        settingsWriter.save(current.copy(blog = blogConfig))
    }

    @Transactional
    fun updateAnalyticsConfig(analyticsConfig: AnalyticsConfig) {
        val current = getSettings()
        settingsWriter.save(current.copy(analytics = analyticsConfig))
    }
}
