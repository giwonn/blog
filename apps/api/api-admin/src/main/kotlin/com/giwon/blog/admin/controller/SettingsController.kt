package com.giwon.blog.admin.controller

import com.giwon.blog.common.dto.ApiResponse
import com.giwon.blog.core.settings.application.SettingsService
import com.giwon.blog.core.settings.domain.AnalyticsConfig
import com.giwon.blog.core.settings.domain.BlogConfig
import com.giwon.blog.core.settings.domain.SiteSettings
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/admin/settings")
class SettingsController(
    private val settingsService: SettingsService,
) {

    @GetMapping
    fun getSettings(): ApiResponse<SiteSettings> {
        return ApiResponse(settingsService.getSettings())
    }

    @PutMapping("/blog")
    fun updateBlogConfig(@RequestBody blogConfig: BlogConfig): ApiResponse<SiteSettings> {
        settingsService.updateBlogConfig(blogConfig)
        return ApiResponse(settingsService.getSettings())
    }

    @PutMapping("/analytics")
    fun updateAnalyticsConfig(@RequestBody analyticsConfig: AnalyticsConfig): ApiResponse<SiteSettings> {
        settingsService.updateAnalyticsConfig(analyticsConfig)
        return ApiResponse(settingsService.getSettings())
    }
}
