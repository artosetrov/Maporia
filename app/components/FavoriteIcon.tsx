import Icon from "./Icon";

type FavoriteIconProps = {
  isActive?: boolean;
  size?: 16 | 20 | 24;
  className?: string;
};

/**
 * Unified favorite/bookmark icon component following Maporia brand guidelines
 * - Uses unified Icon component with "favorite" icon
 * - Active: Olive Green (#8F9E4F), filled
 * - Inactive: Dark (#1F2A1F), outlined
 * - Sizes: 16 / 20 / 24
 */
export default function FavoriteIcon({ 
  isActive = false, 
  size = 20,
  className = "" 
}: FavoriteIconProps) {
  // Use provided className if it contains a color class (text-[...]), otherwise use default colors
  const hasExplicitColor = /text-\[#[0-9A-Fa-f]{6}\]|text-\[#[0-9A-Fa-f]{3}\]/.test(className) || 
                           /text-\[#[0-9A-Fa-f]{8}\]/.test(className) ||
                           className.includes("text-[#");
  const colorClass = hasExplicitColor ? "" : (isActive ? "text-[#8F9E4F]" : "text-[#1F2A1F]");
  
  return (
    <Icon 
      name="favorite"
      size={size}
      className={`${colorClass} ${className}`}
      active={isActive}
      filled={isActive}
    />
  );
}
