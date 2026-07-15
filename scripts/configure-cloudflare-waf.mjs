const API_BASE = "https://api.cloudflare.com/client/v4";
const PHASE = "http_request_firewall_custom";
const RULE_REF = "meal05_wordpress_probe_noise";
const RULE_DESCRIPTION = "Meal05: block generic WordPress probe paths";

const ALLOWED_ACTIONS = new Set(["block", "managed_challenge", "js_challenge"]);
const action = process.env.CLOUDFLARE_WP_PROBE_ACTION || "block";

if (!ALLOWED_ACTIONS.has(action)) {
    fail(
        `CLOUDFLARE_WP_PROBE_ACTION must be one of: ${[...ALLOWED_ACTIONS].join(", ")}`
    );
}

const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;

if (!token) {
    fail("Set CLOUDFLARE_API_TOKEN or CF_API_TOKEN before running this script.");
}

const rule = {
    action,
    expression: [
        '(http.request.uri.path in {"/wp-login.php" "/xmlrpc.php" "/wp-admin/install.php" "/wp-includes/wlwmanifest.xml"}',
        'or starts_with(http.request.uri.path, "/wp-admin/")',
        'or starts_with(http.request.uri.path, "/wp-includes/")',
        'or starts_with(http.request.uri.path, "/wp-content/"))',
    ].join(" "),
    description: RULE_DESCRIPTION,
    enabled: true,
    ref: RULE_REF,
};

try {
    const zoneId = await resolveZoneId();
    const ruleset = await getEntryPointRuleset(zoneId);

    if (!ruleset) {
        const created = await cf(`/zones/${zoneId}/rulesets`, {
            method: "POST",
            body: {
                name: "Meal05 custom WAF rules",
                kind: "zone",
                phase: PHASE,
                rules: [rule],
            },
        });

        console.log(`Created ${PHASE} ruleset ${created.id} with ${RULE_REF}.`);
        process.exit(0);
    }

    const existingRule = (ruleset.rules || []).find(
        (candidate) =>
            candidate.ref === RULE_REF || candidate.description === RULE_DESCRIPTION
    );

    if (existingRule) {
        console.log(`WAF rule already exists: ${existingRule.id || RULE_REF}.`);
        process.exit(0);
    }

    const added = await cf(`/zones/${zoneId}/rulesets/${ruleset.id}/rules`, {
        method: "POST",
        body: rule,
    });

    console.log(`Added WAF rule ${added.id || RULE_REF} to ruleset ${ruleset.id}.`);
} catch (error) {
    if (error.status === 401 || error.status === 403) {
        fail(
            [
                `Cloudflare rejected the API token: ${error.message}`,
                "Create a restricted Cloudflare API token with Zone > Zone > Read and Zone > WAF > Write/Edit for the meal05.com zone.",
                "Do not use an Account ID, Wrangler OAuth token, or a token copied from Wrangler internals.",
            ].join("\n")
        );
    }

    throw error;
}

async function resolveZoneId() {
    const configuredZoneId = process.env.CLOUDFLARE_ZONE_ID || process.env.CF_ZONE_ID;

    if (configuredZoneId) {
        return configuredZoneId;
    }

    const zoneName = process.env.CLOUDFLARE_ZONE_NAME || process.env.CF_ZONE_NAME;

    if (!zoneName) {
        fail("Set CLOUDFLARE_ZONE_ID, CF_ZONE_ID, CLOUDFLARE_ZONE_NAME, or CF_ZONE_NAME.");
    }

    const query = new URLSearchParams({ name: zoneName, per_page: "1" });
    const zones = await cf(`/zones?${query.toString()}`);
    const zone = zones[0];

    if (!zone?.id) {
        fail(`Cloudflare zone not found for ${zoneName}.`);
    }

    return zone.id;
}

async function getEntryPointRuleset(zoneId) {
    try {
        return await cf(`/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`);
    } catch (error) {
        if (error.status === 404) {
            return null;
        }

        throw error;
    }
}

async function cf(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        method: options.method || "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.success === false) {
        const message =
            payload?.errors?.map((error) => `${error.code}: ${error.message}`).join("; ") ||
            response.statusText ||
            "Cloudflare API request failed";
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return payload?.result;
}

function fail(message) {
    console.error(message);
    process.exit(1);
}
