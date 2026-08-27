export function validProfile(overrides = {}) {
  const profile = {
    schemaVersion: 1,
    slug: "new-reading-shop",
    expectedShopId: 24681012,
    brandName: "New Reading Studio",
    layoutVersion: "reading-1200x1500-v1",
    characterAsset: "assets/example-character.svg",
    characterSha256: "a".repeat(64),
    listingDefaults: {
      quantity: 999,
      whoMade: "i_did",
      whenMade: "made_to_order",
      taxonomyId: 1234,
      shippingProfileId: 5678,
      returnPolicyId: 9012,
      shouldAutoRenew: false,
      isSupply: false,
      processingMin: 1,
      processingMax: 2,
      readinessStateId: 1,
    },
  };
  return {
    ...profile,
    ...overrides,
    listingDefaults: {
      ...profile.listingDefaults,
      ...(overrides.listingDefaults || {}),
    },
  };
}

export function validProduct(overrides = {}) {
  const product = {
    id: "love-reading-01",
    sku: "NEW-LOVE-001",
    title: "Personalized Love Reading for Clear and Thoughtful Guidance",
    description:
      "Receive a personalized written reading created from the details you provide. " +
      "The reading is reflective entertainment and is not medical, legal, financial, or mental-health advice. " +
      "Your completed reading is prepared individually and delivered according to the processing time shown on Etsy.",
    price: 12.5,
    tags: [
      "love reading",
      "tarot insight",
      "relationship help",
      "written reading",
      "personal insight",
      "future guidance",
      "intuitive reading",
      "love clarity",
      "digital reading",
      "heart guidance",
      "tarot message",
      "custom reading",
      "spiritual insight",
    ],
    personalization:
      "Please share first names, ages, and the question you would like the reading to explore.",
    thumbnail: {
      topBanner: "PERSONALIZED READING",
      lines: ["LOVE", "CLARITY"],
      subtitle: "WRITTEN FOR YOU",
      accentColor: "#c084fc",
    },
    gallery: [],
    altText: "Abstract reader character with love reading title",
  };
  return {
    ...product,
    ...overrides,
    thumbnail: {
      ...product.thumbnail,
      ...(overrides.thumbnail || {}),
    },
  };
}

export function validCatalog(products = [validProduct()], overrides = {}) {
  return {
    schemaVersion: 1,
    catalogVersion: "starter-v1",
    products,
    ...overrides,
  };
}
