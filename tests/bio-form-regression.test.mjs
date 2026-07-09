import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { it, describe } from "node:test";

const siteSettingsSource = await readFile(
  "./app/app/(dashboard)/site/[id]/settings/page.tsx",
  "utf8"
);

describe("Bio form wiring", () => {
  const bioSection = siteSettingsSource.match(/title="Bio"[^}]+}/s);
  
  it("should have Bio section in settings page", () => {
    assert.ok(bioSection, "Bio section should exist");
  });

  it("should submit to Site.bio field", () => {
    const content = bioSection[0];
    assert.ok(
      content.includes('name: "bio"'),
      "Should submit to Site.bio field"
    );
  });

  it("should load default value from Site.bio", () => {
    const content = bioSection[0];
    assert.ok(
      content.includes("data?.bio"),
      "Should load default value from Site.bio"
    );
  });

  it("should include SEO optimization guidance", () => {
    const content = bioSection[0];
    assert.ok(
      content.includes("SEO-optimized"),
      "Should include SEO optimization guidance"
    );
  });

  it("should not accidentally rename Description field", () => {
    const descSection = siteSettingsSource.match(/title="Description"[^}]+}/s);
    assert.ok(descSection, "Description section should still exist");
    
    const content = descSection[0];
    assert.ok(
      content.includes('name: "description"'),
      "Description field should still be named correctly"
    );
  });
});
