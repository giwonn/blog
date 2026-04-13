package com.giwon.blog.core.settings.domain

data class SiteSettings(
    val blog: BlogConfig = BlogConfig(),
    val analytics: AnalyticsConfig = AnalyticsConfig(),
)

data class BlogConfig(
    val name: String = "Blog",
    val description: String = "",
    val profileImage: String? = null,
)

data class AnalyticsConfig(
    val trackingEnabled: Boolean = true,
)
