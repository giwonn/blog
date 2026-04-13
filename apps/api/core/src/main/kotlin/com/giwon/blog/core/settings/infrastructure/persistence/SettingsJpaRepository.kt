package com.giwon.blog.core.settings.infrastructure.persistence

import com.giwon.blog.core.settings.domain.SettingsEntity
import org.springframework.data.jpa.repository.JpaRepository

interface SettingsJpaRepository : JpaRepository<SettingsEntity, Long>
