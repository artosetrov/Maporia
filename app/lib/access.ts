/**
 * Access control utilities for Maporia user roles and permissions
 * 
 * User Roles:
 * - guest: Not authenticated
 * - standard: Authenticated without active subscription
 * - premium: Authenticated with active subscription
 * - admin: Platform administrator
 */

import type { Profile, Place } from "../types";

export type UserRole = "guest" | "standard" | "premium" | "admin";
export type SubscriptionStatus = "active" | "inactive";
export type AccessLevel = "public" | "premium";

export type UserAccess = {
  role: UserRole;
  hasPremium: boolean;
  isAdmin: boolean;
  subscriptionStatus?: SubscriptionStatus;
};

export type PlaceAccess = {
  accessLevel: AccessLevel;
};

/**
 * Determines user's role and access level based on profile
 * 
 * @param profile - User profile object (from profiles table) or null for guests
 * @returns UserAccess with role, hasPremium, and isAdmin status
 */
export function getUserAccess(profile: Profile | null): UserAccess {
  // Guest: no profile or no authenticated user
  if (!profile) {
    return {
      role: "guest",
      hasPremium: false,
      isAdmin: false,
    };
  }

  // Admin: check is_admin field
  if (profile.is_admin === true) {
    return {
      role: "admin",
      hasPremium: true, // Admin has premium access
      isAdmin: true,
      subscriptionStatus: profile.subscription_status || undefined,
    };
  }

  // Premium: check subscription_status = 'active'
  const subscriptionStatus = profile.subscription_status as SubscriptionStatus | undefined;
  if (subscriptionStatus === "active") {
    return {
      role: "premium",
      hasPremium: true,
      isAdmin: false,
      subscriptionStatus: "active",
    };
  }

  // Standard: authenticated but no active subscription
  return {
    role: "standard",
    hasPremium: false,
    isAdmin: false,
    subscriptionStatus: subscriptionStatus || "inactive",
  };
}

/**
 * Checks if a place is premium-only
 * 
 * @param place - Place object from database
 * @returns true if place is premium-only
 */
export function isPlacePremium(place: Place | { access_level?: string | null; is_premium?: boolean | null; premium_only?: boolean | null; visibility?: string | null; accessLevel?: AccessLevel }): boolean {
  // Check access_level field (primary)
  if (place.access_level === 'premium') {
    return true;
  }
  
  // Legacy fields (for backward compatibility)
  if (place.is_premium === true) {
    return true;
  }
  if (place.premium_only === true) {
    return true;
  }
  if (place.visibility === 'premium') {
    return true;
  }
  
  // For draft state (wizard)
  if (place.accessLevel === "premium") {
    return true;
  }
  
  return false;
}

/**
 * Determines if a user can view a specific place
 * 
 * @param userAccess - User's access level
 * @param place - Place object
 * @returns true if user can view the place
 */
export function canUserViewPlace(userAccess: UserAccess, place: Place | { access_level?: string | null; is_premium?: boolean | null; premium_only?: boolean | null; visibility?: string | null; accessLevel?: AccessLevel }): boolean {
  const isPremium = isPlacePremium(place);
  
  // Public places are viewable by everyone
  if (!isPremium) {
    return true;
  }
  
  // Premium places require premium access (premium role OR admin role)
  return userAccess.hasPremium === true;
}

/**
 * Checks if user can add/edit premium places
 * 
 * @param userAccess - User's access level
 * @returns true if user can create/edit premium places
 */
export function canUserCreatePremiumPlace(userAccess: UserAccess): boolean {
  // Only premium users and admins can create premium places
  return userAccess.role === "premium" || userAccess.role === "admin";
}

/**
 * Checks if user can like/comment/save places
 * 
 * @param userAccess - User's access level
 * @returns true if user can interact with places
 */
export function canUserInteract(userAccess: UserAccess): boolean {
  // Guests cannot interact, all authenticated users can
  return userAccess.role !== "guest";
}

/**
 * Checks if user can add places
 * 
 * @param userAccess - User's access level
 * @returns true if user can add places
 */
export function canUserAddPlace(userAccess: UserAccess): boolean {
  // Only premium users and admins can add places
  return userAccess.role === "premium" || userAccess.role === "admin";
}

/**
 * Checks if user can add premium places
 * 
 * @param userAccess - User's access level
 * @returns true if user can add premium places
 */
export function canUserAddPremiumPlace(userAccess: UserAccess): boolean {
  // Only premium users and admins can add premium places
  return userAccess.role === "premium" || userAccess.role === "admin";
}

/**
 * Checks if user has admin privileges
 * 
 * @param userAccess - User's access level
 * @returns true if user is admin
 */
export function isUserAdmin(userAccess: UserAccess): boolean {
  return userAccess.role === "admin";
}
