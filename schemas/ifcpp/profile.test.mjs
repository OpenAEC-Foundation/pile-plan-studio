import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path, reviver) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"), reviver);
const profile = read("./ifcpp-profile-1.0.0.ifcx");
const minimal = read("./fixtures/minimal.ifcpp");
const complete = read("./fixtures/schema-9-complete.ifcpp");
const foundation = "openaec::foundation::";
const opps = "openaec::opps::";
const source = "openaec::source::";
const projectUnits = "openaec::project::units";
const attribute = (node, key) => node.attributes[key];
const withAttribute = (doc, key) => doc.data.filter((node) => Object.hasOwn(node.attributes, key));
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

// Keep the original JSON number for the precision checks.
function numberToken(_key, value, context) {
  return typeof value === "number" ? context.source : value;
}

function tipLevelMillimetres(token) {
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(token);
  assert.ok(match, "expected a decimal tip level precise to a whole millimetre");
  const [, sign, whole, fraction = ""] = match;
  const magnitude = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  return sign === "-" ? -magnitude : magnitude;
}

function tipLevelToken(millimetres) {
  const sign = millimetres < 0n ? "-" : "";
  const magnitude = millimetres < 0n ? -millimetres : millimetres;
  const fraction = String(magnitude % 1000n).padStart(3, "0").replace(/0+$/, "");
  const whole = sign + String(magnitude / 1000n);
  return fraction ? whole + "." + fraction : whole;
}

function checkValue(value, spec, nodes, path) {
  switch (spec.dataType) {
    case "Object": {
      assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), path);
      const fields = spec.objectRestrictions.values;
      for (const [key, member] of Object.entries(fields)) {
        assert.ok(Object.hasOwn(value, key) || member.optional, path + " missing " + key);
      }
      for (const [key, entry] of Object.entries(value)) {
        assert.ok(Object.hasOwn(fields, key), path + " unknown field " + key);
        checkValue(entry, fields[key], nodes, path + "." + key);
      }
      break;
    }
    case "Array":
      assert.ok(Array.isArray(value), path);
      value.forEach((entry, index) => checkValue(entry, spec.arrayRestrictions.value, nodes, path + "[" + index + "]"));
      break;
    case "Reference":
      assert.ok(nodes.has(value), path + " refers to a missing node");
      break;
    case "Enum":
      assert.ok(spec.enumRestrictions.options.includes(value), path);
      break;
    case "Integer":
      assert.ok(Number.isSafeInteger(value), path);
      break;
    case "Real":
      assert.ok(Number.isFinite(value), path);
      break;
    case "String":
      assert.equal(typeof value, "string", path);
      break;
    case "Boolean":
      assert.equal(typeof value, "boolean", path);
      break;
    default:
      assert.fail("Untested profile type " + spec.dataType);
  }
}

function checkProject(doc) {
  assert.deepEqual(Object.keys(doc).sort(), ["data", "header", "imports", "schemas"]);
  assert.equal(doc.header.ifcxVersion, "ifcx_alpha");
  assert.equal(doc.header.dataVersion, profile.header.dataVersion);
  assert.deepEqual(doc.imports, [{ uri: profile.header.id }], "unsupported profile import");
  assert.deepEqual(doc.schemas, {});
  const nodes = new Map(doc.data.map((node) => [node.path, node]));
  assert.equal(nodes.size, doc.data.length, "duplicate path");
  const seen = new Set();

  function visit(path) {
    assert.ok(uuid.test(path), "path must be a UUID");
    const node = nodes.get(path);
    assert.ok(node && !seen.has(path), "missing child, cycle or multiple owners");
    seen.add(path);
    for (const [key, value] of Object.entries(node.attributes)) {
      assert.ok(Object.hasOwn(profile.schemas, key), "missing definition for " + key);
      checkValue(value, profile.schemas[key].value, nodes, path + "." + key);
    }
    for (const child of Object.values(node.children ?? {})) visit(child);
  }

  function target(path, type) {
    assert.ok(Object.hasOwn(nodes.get(path)?.attributes ?? {}, type), "reference must target " + type);
  }
  const loadPoint = (path) => target(path, foundation + "loadPoint");

  visit(doc.header.id);
  assert.equal(seen.size, nodes.size, "unreachable node");
  assert.equal(attribute(nodes.get(doc.header.id), opps + "document").format, "IFCPP");
  const units = attribute(nodes.get(doc.header.id), projectUnits);
  assert.ok(units, "expected project-wide units");
  const { coordinates, force, pileSize, levels } = units;
  assert.deepEqual({ coordinates, force, pileSize, levels }, { coordinates: "mm", force: "kN", pileSize: "mm", levels: "m" });
  const [design] = withAttribute(doc, foundation + "design");
  target(attribute(design, opps + "planView").plan, foundation + "pilePlan");
  for (const entry of attribute(design, opps + "importLog") ?? []) target(entry.source, source + "document");
  for (const entry of attribute(design, opps + "pileDriving")?.files ?? []) {
    target(entry.source, source + "document");
    target(entry.source, source + "embeddedFile");
  }
  const grouping = attribute(design, opps + "grouping");
  for (const group of [...(grouping.manualGroups ?? []), ...(grouping.ungroupedGroups ?? [])]) {
    group.forEach(loadPoint);
  }
  for (const plan of withAttribute(doc, foundation + "pilePlan")) {
    const assigned = new Set();
    for (const child of Object.values(plan.children ?? {})) {
      target(child, foundation + "pile");
      const { loadPoint } = attribute(nodes.get(child), foundation + "pile");
      target(loadPoint, foundation + "loadPoint");
      assert.ok(!assigned.has(loadPoint), "multiple piles for the same location in one plan");
      assigned.add(loadPoint);
    }
    attribute(plan, opps + "planSettings").lockedLoadPoints.forEach(loadPoint);
    for (const proposal of attribute(plan, opps + "pileCapProposals") ?? []) proposal.loadPoints.forEach(loadPoint);
    for (const choice of attribute(plan, opps + "unassignedChoices") ?? []) {
      loadPoint(choice.loadPoint);
      assert.ok(!assigned.has(choice.loadPoint), "assigned location has an unassigned choice");
    }
    for (const key of ["legacyPileNumbers", "optimizationUnassigned"]) {
      for (const entry of attribute(plan, opps + key) ?? []) {
        const path = entry.loadPoint;
        assert.notEqual(path === undefined, entry.legacyLoadPointNumber === undefined, "expected one legacy location identity");
        if (path !== undefined) loadPoint(path);
        if (key === "legacyPileNumbers") assert.ok(!assigned.has(path), "legacy number belongs on the assigned pile");
      }
    }
  }
  for (const node of withAttribute(doc, foundation + "cptSelection")) {
    for (const cpt of attribute(node, foundation + "cptSelection").cpts) target(cpt, "openaec::cpt");
  }
  for (const node of withAttribute(doc, foundation + "loadPoint")) {
    const { tension } = attribute(node, foundation + "loadPoint");
    if (tension) assert.equal(Object.hasOwn(tension, "value"), tension.state === "known", "tension state conflicts with value");
  }
  for (const node of withAttribute(doc, foundation + "bearingAdvice")) {
    const advice = attribute(node, foundation + "bearingAdvice");
    if (advice.source !== undefined) target(advice.source, source + "document");
    for (const row of advice.entries) {
      assert.notEqual(row.cpt === undefined, row.legacyCptNumber === undefined, "expected one CPT identity");
      if (row.cpt !== undefined) target(row.cpt, "openaec::cpt");
      for (const path of row.sources ?? []) target(path, source + "document");
      assert.equal(Object.hasOwn(row, "resistance"), row.availability === "available", "availability conflicts with resistance");
      assert.ok(row.pileCount === undefined || row.pileCount > 0, "invalid advice pile count");
    }
  }
}

test("both projects resolve the separate profile and the full fixture exercises every attribute", () => {
  assert.deepEqual(profile.imports, []);
  assert.deepEqual(profile.data, []);
  checkProject(minimal);
  checkProject(complete);
  assert.deepEqual(new Set(complete.data.flatMap((node) => Object.keys(node.attributes))), new Set(Object.keys(profile.schemas)));
});

test("two variants keep different numbers on piles at one location", () => {
  const [a, b] = withAttribute(complete, foundation + "pilePlan");
  const [l17, l18] = withAttribute(complete, foundation + "loadPoint");
  const piles = withAttribute(complete, foundation + "pile");
  assert.deepEqual(piles.map((node) => attribute(node, foundation + "pile").loadPoint), [l17.path, l17.path]);
  assert.deepEqual(piles.map((node) => attribute(node, foundation + "pile").pileNumber), ["001-A", "P-17-B"]);
  assert.ok(Object.values(a.children).includes(piles[0].path));
  assert.ok(Object.values(b.children).includes(piles[1].path));
  assert.equal(attribute(l17, foundation + "loadPoint").pileNumber, undefined);
  assert.ok(attribute(a, opps + "planSettings").lockedLoadPoints.includes(l18.path));
  assert.deepEqual(attribute(a, opps + "legacyPileNumbers"), [
    { loadPoint: l18.path, pileNumber: "001" },
    { legacyLoadPointNumber: 97, pileNumber: "P-97" },
  ]);
});

test("missing scoped resistance, real zero and source provenance stay distinct", () => {
  const [advice] = withAttribute(complete, foundation + "bearingAdvice");
  const [universal, , missing, zero, unresolved] = attribute(advice, foundation + "bearingAdvice").entries;
  assert.equal(universal.sources.length, 2);
  assert.equal(missing.pileCount, 2);
  assert.equal(missing.availability, "missing");
  assert.equal(missing.resistance, undefined);
  assert.equal(zero.availability, "available");
  assert.equal(zero.resistance, 0);
  assert.equal(unresolved.legacyCptNumber, 92);
});

test("heistaat bytes and exact optimizer counters stay representable", () => {
  const [foundationNode] = withAttribute(complete, opps + "pileDriving");
  const driving = attribute(foundationNode, opps + "pileDriving");
  assert.equal(driving.sharedIgnoreCsvLeadingZeros, false);
  assert.equal(driving.files[0].overrides.ignoreCsvLeadingZeros, false);
  const [file] = withAttribute(complete, source + "embeddedFile");
  assert.equal(Buffer.from(attribute(file, source + "embeddedFile").data, "base64").toString(), "Paalnummer;Slagen\n001-A;15\n");
  const [plan] = withAttribute(complete, opps + "optimizerResult");
  const { solution } = attribute(plan, opps + "optimizerResult");
  assert.equal(BigInt(solution.cost), 9007199254740993n);
  assert.equal(solution.reference.proof, "optimal");
  assert.equal(solution.proof, "feasible");
});

test("rejects an unsupported profile version", () => {
  const doc = structuredClone(minimal);
  doc.imports[0].uri = "urn:example:ifcpp:9.0.0";
  assert.throws(() => checkProject(doc), /unsupported profile import/);
});

test("load points and CPTs use the coordinate unit declared on the project", () => {
  const [location] = withAttribute(minimal, foundation + "loadPoint");
  const [cpt] = withAttribute(minimal, "openaec::cpt");
  const { x: loadX, y: loadY } = attribute(location, foundation + "loadPoint");
  const { x: cptX, y: cptY } = attribute(cpt, "openaec::cpt");
  assert.deepEqual([loadX, loadY, cptX, cptY], [1000, 2000, 900, 1400]);
  const convertedRoot = complete.data.find(({ path }) => path === complete.header.id);
  assert.equal(attribute(convertedRoot, projectUnits).coordinates, "mm");
  assert.equal(attribute(convertedRoot, opps + "document").legacyUnitLabels.coordinates, "m");

  const doc = structuredClone(minimal);
  const root = doc.data.find(({ path }) => path === doc.header.id);
  root.attributes[projectUnits].coordinates = "m";
  assert.throws(() => checkProject(doc), /project::units\.coordinates|coordinate unit/);
  delete root.attributes[projectUnits];
  assert.throws(() => checkProject(doc), /expected project-wide units/);
});

test("the complete project uses one tip level across the pile, active plan levels and advice", () => {
  const doc = read("./fixtures/schema-9-complete.ifcpp", numberToken);
  const [, pile] = withAttribute(doc, foundation + "pile");
  const [, plan] = withAttribute(doc, foundation + "pilePlan");
  const [advice] = withAttribute(doc, foundation + "bearingAdvice");
  const [design] = withAttribute(doc, foundation + "design");
  const levels = [
    attribute(pile, foundation + "pile").tipLevel,
    ...attribute(plan, opps + "planSettings").activeTipLevels,
    attribute(advice, foundation + "bearingAdvice").entries[1].tipLevel,
  ];
  assert.deepEqual(levels.map(tipLevelMillimetres), [-17123n, -17123n, -17123n]);
  assert.equal(attribute(design, foundation + "design").pileHeadLevel, "-0.7501234567890123");
});

test("decimal metres round-trip whole millimetres without a floating-point conversion", () => {
  const cases = [
    [0n, "0"],
    [-1n, "-0.001"],
    [-17123n, "-17.123"],
    [-17500n, "-17.5"],
    [9007199254740990n, "9007199254740.99"],
    [9007199254740991n, "9007199254740.991"],
    [-9007199254740990n, "-9007199254740.99"],
    [-9007199254740991n, "-9007199254740.991"],
    [9223372036854775807n, "9223372036854775.807"],
    [-9223372036854775808n, "-9223372036854775.808"],
  ];
  for (const [legacyMillimetres, expectedToken] of cases) {
    const token = tipLevelToken(legacyMillimetres);
    assert.equal(token, expectedToken);
    assert.equal(tipLevelMillimetres(JSON.parse(token, numberToken)), legacyMillimetres);
  }
  assert.equal(JSON.parse("9007199254740.99"), JSON.parse("9007199254740.991"));
  assert.throws(() => tipLevelMillimetres("-17.1234"), /whole millimetre/);
});

test("rejects missing and wrong-type CPT references", () => {
  const doc = structuredClone(minimal);
  const [location] = withAttribute(doc, foundation + "cptSelection");
  const { cpts } = attribute(location, foundation + "cptSelection");
  cpts[0] = "d35974c6-25e3-4a8c-a841-2f63cf3f3afa";
  assert.throws(() => checkProject(doc), /refers to a missing node/);
  cpts[0] = withAttribute(doc, foundation + "pilePlan")[0].path;
  assert.throws(() => checkProject(doc), /reference must target openaec::cpt/);
});

test("rejects duplicate assignments and a legacy number for an assigned location", () => {
  const doc = structuredClone(minimal);
  const [plan] = withAttribute(doc, foundation + "pilePlan");
  const [pile] = withAttribute(doc, foundation + "pile");
  plan.attributes[opps + "legacyPileNumbers"] = [{ loadPoint: attribute(pile, foundation + "pile").loadPoint, pileNumber: "001" }];
  assert.throws(() => checkProject(doc), /legacy number belongs on the assigned pile/);
  delete plan.attributes[opps + "legacyPileNumbers"];
  const copy = { ...structuredClone(pile), path: "d35974c6-25e3-4a8c-a841-2f63cf3f3afa" };
  doc.data.push(copy);
  plan.children.Duplicate = copy.path;
  assert.throws(() => checkProject(doc), /multiple piles for the same location/);
});

test("rejects a missing resistance recorded as zero", () => {
  const doc = structuredClone(minimal);
  const [advice] = withAttribute(doc, foundation + "bearingAdvice");
  attribute(advice, foundation + "bearingAdvice").entries.find(({ availability }) => availability === "missing").resistance = 0;
  assert.throws(() => checkProject(doc), /availability conflicts with resistance/);
});
