'use server';

import { apiClient } from '@/lib/api';

export interface BlogConfig {
  name: string;
  description: string;
  profileImage: string | null;
}

export interface AnalyticsConfig {
  trackingEnabled: boolean;
}

export interface SiteSettings {
  blog: BlogConfig;
  analytics: AnalyticsConfig;
}

export async function getSettings(): Promise<SiteSettings> {
  return apiClient<SiteSettings>('/admin/settings');
}

export async function updateBlogConfig(config: BlogConfig): Promise<SiteSettings> {
  return apiClient<SiteSettings>('/admin/settings/blog', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function updateAnalyticsConfig(config: AnalyticsConfig): Promise<SiteSettings> {
  return apiClient<SiteSettings>('/admin/settings/analytics', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}
