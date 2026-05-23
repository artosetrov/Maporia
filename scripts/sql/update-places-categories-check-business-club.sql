-- Keep the database category constraint in sync with app/constants.ts.
-- Required after adding "💼 Business Club" to EXPERIENCE_CATEGORIES.

ALTER TABLE public.places
  DROP CONSTRAINT IF EXISTS places_categories_check;

ALTER TABLE public.places
  ADD CONSTRAINT places_categories_check
  CHECK (
    categories IS NULL
    OR categories <@ ARRAY[
      '🍽 Food & Drinks',
      '🍸 Bars & Wine',
      '🌅 Scenic & Views',
      '🌳 Nature & Walks',
      '🎭 Culture & History',
      '🛍 Shops & Markets',
      '🤫 Hidden & Unique',
      '✨ Vibe & Atmosphere',
      '👻 Crime & Haunted',
      '📸 Photography',
      '👨‍🍳 Chefs & Catering',
      '💆 Massage',
      '🍱 Prepared Meals',
      '💪 Training & Fitness',
      '💄 Makeup',
      '✂️ Hair',
      '🧖 Spa & Wellness',
      '🎨 Creative Services',
      '🛠 Other Services',
      '🏊 Water Sports',
      '🥾 Adventures',
      '🍳 Cooking Classes',
      '🗺 Tours & Walks',
      '🎨 Workshops',
      '💼 Business Club',
      '🧘 Wellness & Retreats',
      '🎶 Music & Nightlife',
      '📷 Photo Walks',
      '🦊 Wildlife & Nature',
      '🍷 Tastings'
    ]::text[]
  );
