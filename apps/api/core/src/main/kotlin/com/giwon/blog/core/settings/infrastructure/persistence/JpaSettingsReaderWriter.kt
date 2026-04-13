package com.giwon.blog.core.settings.infrastructure.persistence

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.giwon.blog.core.settings.domain.*
import org.springframework.stereotype.Component

@Component
class JpaSettingsReaderWriter(
    private val settingsJpaRepository: SettingsJpaRepository,
) : SettingsReader, SettingsWriter {

    private val objectMapper = jacksonObjectMapper()

    override fun get(): SiteSettings? {
        val entity = settingsJpaRepository.findById(1L).orElse(null) ?: return null
        return objectMapper.readValue<SiteSettings>(entity.config)
    }

    override fun save(settings: SiteSettings) {
        val json = objectMapper.writeValueAsString(settings)
        val entity = settingsJpaRepository.findById(1L).orElse(SettingsEntity())
        entity.config = json
        settingsJpaRepository.save(entity)
    }
}
