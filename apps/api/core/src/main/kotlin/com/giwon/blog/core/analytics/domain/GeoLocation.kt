package com.giwon.blog.core.analytics.domain

data class GeoLocation(
    val latitude: Double,
    val longitude: Double,
    val country: String?,
    val city: String?,
)

interface GeoLocationResolver {
    fun resolve(ipAddress: String): GeoLocation?
}
