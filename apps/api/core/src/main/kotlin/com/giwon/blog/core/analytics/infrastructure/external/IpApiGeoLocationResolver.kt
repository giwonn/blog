package com.giwon.blog.core.analytics.infrastructure.external

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.giwon.blog.core.analytics.domain.GeoLocation
import com.giwon.blog.core.analytics.domain.GeoLocationResolver
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

@Component
class IpApiGeoLocationResolver : GeoLocationResolver {

    private val restClient = RestClient.builder()
        .baseUrl("http://ip-api.com")
        .build()
    private val objectMapper = jacksonObjectMapper()

    override fun resolve(ipAddress: String): GeoLocation? {
        if (ipAddress == "127.0.0.1" || ipAddress.startsWith("192.168.") || ipAddress.startsWith("10.")) {
            return null
        }

        return try {
            val response = restClient.get()
                .uri("/json/$ipAddress?fields=status,lat,lon,country,city")
                .retrieve()
                .body(String::class.java) ?: return null

            val json = objectMapper.readValue<Map<String, Any>>(response)
            if (json["status"] != "success") return null

            GeoLocation(
                latitude = (json["lat"] as Number).toDouble(),
                longitude = (json["lon"] as Number).toDouble(),
                country = json["country"] as? String,
                city = json["city"] as? String,
            )
        } catch (e: Exception) {
            null
        }
    }
}
