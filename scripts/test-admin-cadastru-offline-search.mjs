import assert from "node:assert/strict";
import { createAdminSessionToken } from "../src/lib/admin-auth.js";
import { POST } from "../src/app/api/admin/cadastru-storage/search/route.js";

async function runTests() {
  console.log("Starting Admin Cadastru Offline Search tests...");

  const adminToken = createAdminSessionToken();
  assert(adminToken, "Admin token should be generated");

  const makeRequest = (body, auth = true) => {
    const req = new Request("http://localhost:3000/api/admin/cadastru-storage/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    req.cookies = {
      get(name) {
        if (auth && name === "admin_token") {
          return { value: adminToken };
        }
        return undefined;
      },
    };
    return req;
  };

  // Test 1: Unauthorized request
  {
    console.log("Test 1: Unauthorized request");
    const res = await POST(makeRequest({ cadastral_number: "0100414.176.01.044" }, false));
    assert.equal(res.status, 401, "Should reject unauthenticated request with 401");
  }

  // Test 2: Search by cadastral number (Matei Basarab 16/1)
  {
    console.log("Test 2: Search by cadastral number (0100414.176.01.044)");
    const res = await POST(makeRequest({ cadastral_number: "0100414.176.01.044" }));
    assert.equal(res.status, 200, "Should return 200 for stored record");
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.cadastral.cadastral_number, "0100414.176.01.044");
    assert.equal(data.storage_info.external_api_called, false);
    assert(data.cadastral.map_location, "Should have map_location");
    assert.equal(data.cadastral.map_location.latitude, 47.05385808);
    assert.equal(data.cadastral.apartment?.area_m2, "78");
  }

  // Test 3: Search by cadastral number with nearby & transport (Decebal 63)
  {
    console.log("Test 3: Search by cadastral number with nearby & transport (0100106.131.01.051)");
    const res = await POST(makeRequest({ cadastral_number: "0100106.131.01.051" }));
    assert.equal(res.status, 200, "Should return 200 for stored record");
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.cadastral.cadastral_number, "0100106.131.01.051");
    assert.equal(data.storage_info.external_api_called, false);
    assert(data.nearby, "Should have local nearby data");
    assert(data.nearby.categories?.food, "Nearby should have food category");
    assert(data.nearby.location, "Nearby should have location coordinates for map");
    assert(data.public_transport, "Should have local public transport data");
    assert(data.public_transport.route_groups?.length > 0, "Should have route groups");
  }

  // Test 4: Search by address (Chișinău, bulevard Decebal 63, ap. 51)
  {
    console.log("Test 4: Search by address (Chișinău, bulevard Decebal 63, ap. 51)");
    const res = await POST(makeRequest({
      city: "Chișinău",
      road_type: "bulevard",
      street: "Decebal",
      house_number: "63",
      apartment_number: "51",
    }));
    assert.equal(res.status, 200, "Should return 200 for stored address");
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.cadastral.cadastral_number, "0100106.131.01.051");
    assert.equal(data.storage_info.external_api_called, false);
    assert(data.nearby, "Should have local nearby data");
    assert(data.public_transport, "Should have local public transport data");
  }

  // Test 5: Search non-existent valid cadastral number (Offline mode - no external call, returns 404)
  {
    console.log("Test 5: Search non-existent cadastral number (0100999.999.01.001)");
    const res = await POST(makeRequest({ cadastral_number: "0100999.999.01.001" }));
    assert.equal(res.status, 404, "Should return 404 for missing local record");
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.equal(data.external_api_called, false);
  }

  console.log("All Admin Cadastru Offline Search tests passed successfully! 🎉");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
