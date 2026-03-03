import type { Resume } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { initialResume } from '../data/initialState';
import * as api from './api';

export interface UserProfile {
    id: string;
    name: string;
    data: Resume;
    updatedAt: number;
    isActive: boolean;
    hasCompletedOnboarding?: boolean;
}

// ============ CACHE LAYER ============
// localStorage is used as a cache for faster loads, not as primary storage
// DB (via API) is always the source of truth
// Cache is cleared on logout to prevent data leaks between users

const CACHE_PREFIX = 'careerflow_profile_cache_';
const CACHE_TIMESTAMP_KEY = 'careerflow_cache_timestamp'; // Legacy: Global timestamp
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache validity

interface ProfileCache {
    profiles: UserProfile[];
    activeProfileId: string | null;
    timestamp: number;
}

// Helper to get cache key for specific user
const getCacheKey = (userId?: string) => {
    if (!userId) return 'careerflow_guest_cache';
    return `${CACHE_PREFIX}${userId}`;
};

// Get cached profiles (returns null if cache miss or expired)
const getCachedProfiles = (userId?: string): ProfileCache | null => {
    try {
        const key = getCacheKey(userId);
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const data = JSON.parse(cached) as ProfileCache;
        if (!data.timestamp) return null; // Invalid format

        const cacheAge = Date.now() - data.timestamp;
        if (cacheAge > CACHE_TTL) {
            console.log(`[Cache] Cache expired for ${userId || 'guest'}, will fetch from API`);
            return null;
        }

        return data;
    } catch (e) {
        console.warn('[Cache] Failed to read cache:', e);
        return null;
    }
};

// Update cache with fresh data
const updateCache = (profiles: UserProfile[], userId?: string): void => {
    try {
        const activeProfile = profiles.find(p => p.isActive);
        const cache: ProfileCache = {
            profiles,
            activeProfileId: activeProfile?.id || null,
            timestamp: Date.now()
        };
        const key = getCacheKey(userId);
        localStorage.setItem(key, JSON.stringify(cache));
        console.log(`[Cache] Updated cache for ${userId || 'guest'} with`, profiles.length, 'profiles');
    } catch (e) {
        console.warn('[Cache] Failed to update cache:', e);
    }
};

// Invalidate cache (force next read to fetch from API)
export const invalidateCache = (userId?: string): void => {
    const key = getCacheKey(userId);
    localStorage.removeItem(key);
    console.log(`[Cache] Cache invalidated for ${userId || 'guest'}`);
};

// Clear all cached data (call on logout)
export const clearCache = (): void => {
    // Clear all keys starting with prefix
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith(CACHE_PREFIX) || key === 'careerflow_guest_cache') {
            localStorage.removeItem(key);
        }
    });
    localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    console.log('[Cache] All caches cleared');
};

// Convert API profile to UserProfile format
const apiToUserProfile = (apiProfile: any): UserProfile => ({
    id: apiProfile.id,
    name: apiProfile.name,
    data: apiProfile.data,
    updatedAt: apiProfile.updatedAt ? new Date(apiProfile.updatedAt).getTime() : Date.now(),
    isActive: apiProfile.isActive || false,
    hasCompletedOnboarding: apiProfile.hasCompletedOnboarding ?? false,
});

// ============ PROFILE OPERATIONS (DB + Cache) ============

export const getAllProfiles = async (userId?: string): Promise<UserProfile[]> => {
    // Try cache first for instant load
    const cached = getCachedProfiles(userId);
    if (cached) {
        console.log(`[Storage] Returning cached profiles for ${userId || 'guest'}`);

        // Only refresh background if we have a userId (Auth mode)
        if (userId) {
            api.getProfiles().then(apiProfiles => {
                const profiles = (apiProfiles as any[]).map(apiToUserProfile);
                updateCache(profiles, userId);
            }).catch(e => console.warn('[Cache] Background refresh failed:', e));
        }

        return cached.profiles;
    }

    // Cache miss - fetch from API (Only if authenticated/userId provided)
    // If guest (no userId), return empty array or local only? 
    // Guest mode logic is handled by frontend Context usually, but here we assume API fetch if not found.
    // Wait: Guest mode shouldn't call API.

    if (userId) {
        try {
            console.log('[Storage] Cache miss, fetching from API');
            const apiProfiles = await api.getProfiles();
            const profiles = (apiProfiles as any[]).map(apiToUserProfile);
            updateCache(profiles, userId);
            return profiles;
        } catch (error) {
            console.error('Failed to fetch profiles from API:', error);
            throw error;
        }
    } else {
        // Guest mode fallback (should basically return empty or handle local persistence differently)
        return [];
    }
};

// Sync version for immediate reads (from cache only)
export const getAllProfilesSync = (userId?: string): UserProfile[] => {
    const cached = getCachedProfiles(userId);
    return cached?.profiles || [];
};

export const createProfile = async (name: string, data: Resume = initialResume, userId?: string): Promise<UserProfile> => {
    const clonedData = JSON.parse(JSON.stringify(data));
    const resumeData = { ...clonedData, id: uuidv4() };

    try {
        const apiProfile = await api.createProfile(name, resumeData);
        const profile = apiToUserProfile(apiProfile);

        // Update cache with new profile
        const cached = getCachedProfiles(userId);
        if (cached) {
            cached.profiles.push(profile);
            updateCache(cached.profiles, userId);
        } else {
            invalidateCache(userId); // Force refresh on next read
        }

        return profile;
    } catch (error) {
        console.error('Failed to create profile via API:', error);
        throw error;
    }
};

export const saveProfile = async (profile: UserProfile, userId?: string): Promise<void> => {
    try {
        await api.updateProfile(profile.id, {
            name: profile.name,
            data: profile.data,
            isActive: profile.isActive,
        });

        // Update cache
        const cached = getCachedProfiles(userId);
        if (cached) {
            const idx = cached.profiles.findIndex(p => p.id === profile.id);
            if (idx >= 0) {
                cached.profiles[idx] = { ...profile, updatedAt: Date.now() };
                updateCache(cached.profiles, userId);
            }
        }
    } catch (error) {
        console.error('Failed to save profile via API:', error);
        throw error;
    }
};

export const deleteProfile = async (id: string, userId?: string): Promise<void> => {
    try {
        await api.deleteProfile(id);

        // Update cache
        const cached = getCachedProfiles(userId);
        if (cached) {
            cached.profiles = cached.profiles.filter(p => p.id !== id);
            updateCache(cached.profiles, userId);
        }
    } catch (error) {
        console.error('Failed to delete profile via API:', error);
        throw error;
    }
};

export const setActiveProfileId = async (id: string, userId?: string): Promise<UserProfile | null> => {
    try {
        await api.updateProfile(id, { isActive: true });

        // Update cache - set all others inactive, this one active
        const cached = getCachedProfiles(userId);
        if (cached) {
            cached.profiles = cached.profiles.map(p => ({
                ...p,
                isActive: p.id === id
            }));
            updateCache(cached.profiles, userId);

            return cached.profiles.find(p => p.id === id) || null;
        }

        // No cache, fetch fresh
        const profiles = await getAllProfiles(userId);
        return profiles.find(p => p.id === id) || null;
    } catch (e: any) {
        console.error('Failed to set active profile via API', e);

        // Handle 404 - cache is stale, clear it and re-fetch from DB
        const errorMsg = e.message?.toLowerCase() || '';
        if (e.response?.status === 404 || errorMsg.includes('404') || errorMsg.includes('not found')) {
            console.log('[Storage] Profile 404 during activation - cache is stale, fetching fresh from DB...');
            invalidateCache(userId);

            // Fetch fresh profiles from DB and return the first active one
            const freshProfiles = await getAllProfiles(userId);
            const activeProfile = freshProfiles.find(p => p.isActive) || freshProfiles[0];

            if (activeProfile) {
                return activeProfile;
            }
            // No profiles exist
            throw new Error('No profiles found. Please create a profile first.');
        }

        throw e;
    }
};

export const getActiveProfile = async (userId?: string): Promise<UserProfile | null> => {
    const profiles = await getAllProfiles(userId);
    const active = profiles.find(p => p.isActive);

    if (active) return active;

    // Fallback if no active profile found
    if (profiles.length > 0) {
        await setActiveProfileId(profiles[0].id, userId);
        return { ...profiles[0], isActive: true };
    }

    // No profiles exist
    return null;
};

// Sync version for immediate reads (from cache only)
export const getActiveProfileSync = (userId?: string): UserProfile | null => {
    const cached = getCachedProfiles(userId);
    if (!cached) return null;
    return cached.profiles.find(p => p.isActive) || cached.profiles[0] || null;
};

export const saveResumeToProfile = async (resume: Resume, userId?: string): Promise<Resume> => {
    const data = { ...resume }; // Clone to avoid mutation side-effects
    const profileName = data.personalInfo?.fullName || 'My Resume';

    try {
        // 1. Identify Target Profile
        // We trust resume.id if it exists, otherwise check active profile
        let targetId = data.id;

        // Optimistic update? No, let's be safe.
        // If we don't strictly trust resume.id (it might be a uuidv4 generated locally), 
        // we should check if it exists in our cache/DB.
        // For now, let's assume we try to update.

        await api.updateProfile(targetId, {
            data,
            name: profileName,
            isActive: true
        });

        // Update Cache
        const cached = getCachedProfiles(userId);
        if (cached) {
            const idx = cached.profiles.findIndex(p => p.id === targetId);
            if (idx >= 0) {
                cached.profiles[idx] = {
                    ...cached.profiles[idx],
                    name: profileName,
                    data,
                    updatedAt: Date.now(),
                    isActive: true
                };
                updateCache(cached.profiles, userId);
            } else {
                // ID matches no cached profile? Might be new or cache stale.
                invalidateCache(userId);
            }
        }

        return data;

    } catch (error: any) {
        console.error('[Storage] Save failed:', error);

        // Handle 404 (Not Found) - cache is stale, clear it and re-fetch from DB
        const errorMsg = error.message?.toLowerCase() || '';
        if (error.response?.status === 404 || errorMsg.includes('404') || errorMsg.includes('not found')) {
            console.log('[Storage] Profile 404 - cache is stale, invalidating and fetching fresh from DB...');
            invalidateCache(userId);

            // Fetch fresh profiles from DB
            const freshProfiles = await getAllProfiles(userId);
            const activeProfile = freshProfiles.find(p => p.isActive) || freshProfiles[0];

            if (activeProfile) {
                // Retry save with the correct active profile ID
                console.log('[Storage] Retrying save with fresh profile ID:', activeProfile.id);
                const correctedData = { ...data, id: activeProfile.id };
                return saveResumeToProfile(correctedData, userId);
            } else {
                // No profiles exist in DB - this is a real error, user needs to create one
                console.error('[Storage] No profiles found in DB for user');
                throw new Error('No profiles found. Please create a profile first.');
            }
        }

        throw error;
    }
};

export const updateActiveProfileData = async (data: Resume, userId?: string): Promise<Resume> => {
    return saveResumeToProfile(data, userId);
};

// ============ ONBOARDING STATUS (DB + Cache) ============

export const getOnboardingStatus = async (userId?: string): Promise<boolean> => {
    // Try cache first
    const cached = getCachedProfiles(userId);
    if (cached && cached.profiles.length > 0) {
        const activeProfile = cached.profiles.find(p => p.isActive) || cached.profiles[0];
        return activeProfile?.hasCompletedOnboarding ?? false;
    }

    // Fetch from API
    try {
        const profiles = await api.getProfiles();
        if (!profiles || profiles.length === 0) return false;
        // Check the first/active profile's onboarding status
        const activeProfile = (profiles as any[]).find((p: any) => p.isActive) || profiles[0];
        return activeProfile?.hasCompletedOnboarding ?? false;
    } catch (error) {
        console.error('[Storage] Failed to get onboarding status:', error);
        return false;
    }
};

export const completeOnboarding = async (userId?: string): Promise<void> => {
    try {
        const profiles = await api.getProfiles();
        if (profiles && profiles.length > 0) {
            const activeProfile = (profiles as any[]).find((p: any) => p.isActive) || profiles[0];
            await api.updateProfile(activeProfile.id, { hasCompletedOnboarding: true });
            console.log('[Storage] Marked onboarding complete for profile:', activeProfile.id);

            // Update cache
            const cached = getCachedProfiles(userId);
            if (cached) {
                const idx = cached.profiles.findIndex(p => p.id === activeProfile.id);
                if (idx >= 0) {
                    cached.profiles[idx].hasCompletedOnboarding = true;
                    updateCache(cached.profiles, userId);
                }
            }
        }
    } catch (error) {
        console.error('[Storage] Failed to complete onboarding:', error);
        throw error;
    }
};

export const getProfileFromApi = async (userId: string): Promise<UserProfile | null> => {
    try {
        const profiles = await api.getProfiles();
        const active = (profiles as any[]).find((p: any) => p.isActive);
        const target = active || profiles[0];

        if (target) {
            const profile = apiToUserProfile(target);
            // Update cache with fresh data scoped to user
            const allProfiles = (profiles as any[]).map(apiToUserProfile);
            updateCache(allProfiles, userId);
            return profile;
        }
        return null;
    } catch (e) {
        console.error('Failed to get profile from API:', e);
        return null;
    }
};

// ============ UTILITY FUNCTIONS ============

export const resetApplication = (): void => {
    clearCache();
    window.location.reload();
};

// Clear all local data (call on logout)
export const clearLocalData = (): void => {
    clearCache();
    console.log('[Storage] Local data cleared');
};
