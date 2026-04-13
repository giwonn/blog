package com.giwon.blog.core.settings.domain

import jakarta.persistence.*

@Entity
@Table(name = "settings")
class SettingsEntity(
    @Id
    val id: Long = 1,

    @Column(nullable = false, columnDefinition = "jsonb")
    var config: String = "{}",
)
