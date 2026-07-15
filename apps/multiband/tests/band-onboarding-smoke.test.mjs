import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const createSiteModalSource = await readFile(
  "./components/modal/create-site.tsx",
  "utf8"
);
const actionsSource = await readFile("./lib/actions/actions.ts", "utf8");

const expectedFields = [
  "name",
  "bandName",
  "subdomain",
  "description",
  "featuredEmbed",
];

function assertIncludes(source, expected, message) {
  assert.ok(source.includes(expected), message);
}

describe("Band onboarding smoke path", () => {
  it("collects the core band site fields in the create-site modal", () => {
    assertIncludes(
      createSiteModalSource,
      "Create a new band site",
      "Modal should identify the flow as band site creation"
    );

    for (const field of expectedFields) {
      assertIncludes(
        createSiteModalSource,
        `name="${field}"`,
        `Modal should collect ${field}`
      );
    }
  });

  it("keeps generated subdomains URL-safe before submit", () => {
    assertIncludes(
      createSiteModalSource,
      ".toLowerCase()",
      "Generated subdomain should normalize case"
    );
    assertIncludes(
      createSiteModalSource,
      ".trim()",
      "Generated subdomain should remove leading/trailing whitespace"
    );
    assertIncludes(
      createSiteModalSource,
      '.replace(/[\\W_]+/g, "-")',
      "Generated subdomain should replace unsafe characters with dashes"
    );
    assertIncludes(
      createSiteModalSource,
      'pattern="[a-zA-Z0-9\\-]+"',
      "Subdomain input should reject unsupported characters"
    );
  });

  it("submits through the createSite action and routes to the new site", () => {
    assertIncludes(
      createSiteModalSource,
      "createSite(data)",
      "Modal should call the createSite server action"
    );
    assertIncludes(
      createSiteModalSource,
      "router.push(`/site/${id}`)",
      "Successful onboarding should route to the new site management page"
    );
    assertIncludes(
      createSiteModalSource,
      'va.track("Created Site")',
      "Successful onboarding should record the site creation event"
    );
  });

  it("persists the currently supported tenant data after authentication", () => {
    for (const field of ["name", "description", "subdomain", "featuredEmbed"]) {
      assertIncludes(
        actionsSource,
        `formData.get("${field}")`,
        `createSite should read ${field} from form data`
      );
    }

    assertIncludes(
      actionsSource,
      "if (!session?.user.id)",
      "createSite should require an authenticated user"
    );
    assertIncludes(
      actionsSource,
      "prisma.site.create",
      "createSite should create a tenant Site"
    );
    assertIncludes(
      actionsSource,
      "socialMediaLinks",
      "createSite should create the initial social media link record"
    );
    assertIncludes(
      actionsSource,
      "featuredEmbed: youTubeFeaturedEmbed",
      "createSite should persist the featured embed"
    );
    assertIncludes(
      actionsSource,
      "connect: {",
      "createSite should connect the site to the authenticated user"
    );
    assertIncludes(
      actionsSource,
      "revalidateTag",
      "createSite should revalidate the tenant metadata cache"
    );
  });
});
