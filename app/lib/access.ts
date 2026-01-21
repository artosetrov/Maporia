/**
 * Access control utilities for Premium subscription features
 * 
 * TODO: When subscription schema is added, update getUserAccess to read from:
 * - profiles.plan OR profiles.tier OR profiles.is_premium OR profiles.subscription_status
 * - OR subscriptions table if exists
 */

export type AccessLevel = "public" | "premium";

export type UserAccess = {
  hasPremium: boolean;
  tier?: string;
};

export type PlaceAccess = {
  accessLevel: AccessLevel;
};

/**
 * Determines user's premium access status
 * Currently returns false as subscription fields don't exist in schema yet
 * 
 * @param profile - User profile object (from profiles table)
 * @returns UserAccess with hasPremium status
 */
export function getUserAccess(profile: any): UserAccess {
  // TODO: Check for subscription fields in profile:
  // - profile.plan === 'premium' | 'pro'
  // - profile.tier === 'premium' | 'pro'
  // - profile.is_premium === true
  // - profile.subscription_status === 'active'
  // - profile.pro === true
  // - profile.premium_until > now()
  // 
  // If subscription table exists, check:
  // - subscriptions table with user_id and status='active'
  
  return {
    hasPremium: false, // TODO: Implement when subscription schema is added
    tier: undefined,
  };
}

/**
 * Checks if a place is premium-only
 * 
 * @param place - Place object from database
 * @returns true if place is premium-only
 */
export function isPlacePremium(place: any): boolean {
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
export function canUserViewPlace(userAccess: UserAccess, place: any): boolean {
  const isPremium = isPlacePremium(place);
  
  // Public places are viewable by everyone
  if (!isPremium) {
    return true;
  }
  
  // Premium places require premium access
  return userAccess.hasPremium === true;
}
