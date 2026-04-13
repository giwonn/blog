package com.giwon.blog.core.settings.domain

interface SettingsReader {
    fun get(): SiteSettings?
}
