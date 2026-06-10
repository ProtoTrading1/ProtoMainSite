import categories from '../data/categories.json';

// Theme cards drive the visual merchandising tiles on each L1 category landing
// page and mega-menu. Derived from the imported taxonomy (categories.json) so
// they always reflect the current department/subcategory structure.
export const DEPT_THEME_CARDS = Object.fromEntries(
  categories.map((c) => [
    c.id,
    (c.children || []).slice(0, 4).map((child) => ({
      id: child.id,
      title: child.label,
      subtitle: child.description || '',
      badge: null,
      path: [c.id, child.id],
    })),
  ])
);
