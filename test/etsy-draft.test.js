import assert from "node:assert/strict";
import test from "node:test";

import { buildDraftPayload, uploadDraftProducts, __test as etsyTest } from "../src/etsy-client.js";
import { validProduct, validProfile } from "./fixtures.js";

test("Etsy payload contains listing data but never an activation state", () => {
  const product = validProduct();
  const payload = buildDraftPayload(validProfile(), product);

  assert.deepEqual(payload, {
    quantity: 999,
    title: product.title,
    description: product.description,
    price: "12.50",
    who_made: "i_did",
    when_made: "made_to_order",
    taxonomy_id: 1234,
    shipping_profile_id: 5678,
    return_policy_id: 9012,
    tags: product.tags,
    should_auto_renew: false,
    is_supply: false,
    processing_min: 1,
    processing_max: 2,
    readiness_state_id: 1,
  });
  assert.equal(Object.hasOwn(payload, "state"), false);
  assert.equal(JSON.stringify(payload).includes("active"), false);
});

test("form encoding preserves Etsy tags but omits empty values", () => {
  const encoded = etsyTest.formBody({
    title: "A reading",
    tags: ["one tag", "second tag"],
    state: undefined,
    empty: "",
  });
  assert.equal(encoded.get("title"), "A reading");
  assert.equal(encoded.get("tags"), "one tag,second tag");
  assert.equal(encoded.has("state"), false);
  assert.equal(encoded.has("empty"), false);
});

test("programmatic Etsy draft writes also require explicit apply", async () => {
  await assert.rejects(() => uploadDraftProducts({}, []), /require explicit apply=true/);
});
