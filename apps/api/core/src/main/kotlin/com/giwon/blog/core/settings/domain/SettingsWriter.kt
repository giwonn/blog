package com.giwon.blog.core.settings.domain

interface SettingsWriter {
    fun save(settings: SiteSettings)
}
