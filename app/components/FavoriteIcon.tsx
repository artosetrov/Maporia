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
 * - Inactive: Muted (#A8B096), outlined
 * - Sizes: 16 / 20 / 24
 */
export default function FavoriteIcon({ 
  isActive = false, 
  size = 20,
  className = "" 
}: FavoriteIconProps) {
  const colorClass = isActive ? "text-[#8F9E4F]" : "text-[#A8B096] opacity-40";
  
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
