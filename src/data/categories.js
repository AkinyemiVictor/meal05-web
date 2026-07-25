export const categories = [
  {
    slug: "meat-poultry",
    productKey: "meatPoultry",
    label: "Meat & Poultry",
    icon: "fa-drumstick-bite",
    description: "Premium cuts for grills, stews, and Sunday roasts.",
  },
  {
    slug: "fish-seafood",
    productKey: "fishSeaFood",
    label: "Fish & Seafood",
    icon: "fa-fish",
    description: "River and ocean catch cleaned, portioned, and frozen fresh.",
  },
  {
    slug: "vegetables",
    productKey: "vegetables",
    label: "Vegetables",
    icon: "fa-carrot",
    description: "Leafy greens, peppers, and crunchy veggies for every recipe.",
  },
  {
    slug: "fruits",
    productKey: "fruits",
    label: "Fruits",
    icon: "fa-apple-whole",
    description: "Seasonal fruits sourced fresh each market day.",
  },
  {
    slug: "grains-cereals",
    productKey: "grainsCereals",
    label: "Grains & Cereals",
    icon: "fa-wheat-awn",
    description: "Stone-free rice, grains, and breakfast cereals in stock.",
  },
  {
    slug: "dairy-eggs",
    productKey: "dairyEggs",
    label: "Dairy & Eggs",
    icon: "fa-cheese",
    description: "From farm eggs to cultured dairy and yogurt treats.",
  },
  {
    slug: "tubers-legumes",
    productKey: "tubersLegumes",
    label: "Tubers & Legumes",
    icon: "fa-seedling",
    description: "Yams, beans, and staple legumes ready for hearty meals.",
  },
  {
    slug: "spices-condiments",
    productKey: "spicesCondiments",
    label: "Spices & Condiments",
    icon: "fa-mortar-pestle",
    description: "Flavor boosters, rubs, and pantry condiments curated for chefs.",
  },
  {
    slug: "oil-cooking-essentials",
    productKey: "oilCookingEssentials",
    label: "Oil & Cooking Essentials",
    icon: "fa-oil-can",
    description: "Premium oils, salts, and cooking basics for any kitchen.",
  },
  {
    slug: "drinks-beverages",
    productKey: "DrinksBeverages",
    label: "Drinks & Beverages",
    icon: "fa-mug-hot",
    description: "Juices, wellness drinks, and refreshers for every occasion.",
  },
  {
    slug: "cooked-food",
    productKey: "cookedFood",
    label: "Cooked Food",
    icon: "fa-utensils",
    description: "Ready-to-serve meals and meal-prep favorites delivered hot.",
  },
  {
    slug: "snacks-pastries",
    productKey: "SnackesPasteries",
    label: "Snacks & Pastries",
    icon: "fa-cookie-bite",
    description: "Sweet and savory bites for tea-time, brunch, and gifting.",
  },
  {
    slug: "pantry-processed-foods",
    productKey: "pantryProcessedFoods",
    label: "Pantry & Processed Foods",
    icon: "fa-kitchen-set",
    description: "Shelf-stable staples and processed foods for everyday cooking.",
  },
  {
    slug: "others",
    productKey: "others",
    label: "Others",
    icon: "fa-basket-shopping",
    description: "Household extras and gourmet finds beyond the core aisles.",
  },
];

export const categoryMap = categories.reduce((acc, category) => {
  acc[category.slug] = category;
  return acc;
}, {});

export function getCategoryBySlug(slug) {
  return categoryMap[slug];
}

export function getCategoryHref(category) {
  return `/categories/${category.slug}`;
}

export default categories;
