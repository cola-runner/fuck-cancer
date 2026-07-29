import assert from "node:assert/strict";
import { test } from "node:test";

test("资料权威等级只依据明确的可信域名，不把普通网页标成官方", async () => {
  const { classifySourceAuthority } = await import(
    "../src/lib/source-authority.js"
  );

  assert.equal(
    classifySourceAuthority("research", "https://www.fda.gov/drugs/example"),
    "official"
  );
  assert.equal(
    classifySourceAuthority(
      "auto",
      "https://pubmed.ncbi.nlm.nih.gov/123456/"
    ),
    "medical"
  );
  assert.equal(
    classifySourceAuthority("research", "https://example.com/article"),
    "web"
  );
  assert.equal(
    classifySourceAuthority("research", "https://fda.gov.example.com/trap"),
    "web"
  );
  assert.equal(classifySourceAuthority(null, null), "user");
});
