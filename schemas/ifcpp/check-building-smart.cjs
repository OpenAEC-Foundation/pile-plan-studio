const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const compiledCore = process.argv[2];
assert.ok(compiledCore, "Pass the directory of the compiled buildingSMART ifcx-core");
const { IfcxLayerStackBuilder } = require(path.resolve(compiledCore, "layers/layer-stack.js"));
const { InMemoryLayerProvider } = require(path.resolve(compiledCore, "layers/layer-providers.js"));
const read = (file) => JSON.parse(readFileSync(path.join(__dirname, file), "utf8"));
const profile = read("ifcpp-profile-1.0.0.ifcx");

async function load(project, withProfile = true) {
  const provider = new InMemoryLayerProvider().add(project);
  if (withProfile) provider.add(profile);
  return new IfcxLayerStackBuilder(provider).FromId(project.header.id).Build();
}

function countNodes(node) {
  let count = 1;
  for (const child of node.children.values()) count += countNodes(child);
  return count;
}

async function main() {
  for (const file of ["minimal.ifcpp", "schema-9-complete.ifcpp"]) {
    const project = read("fixtures/" + file);
    const stack = await load(project);
    if (stack instanceof Error) throw stack;

    assert.deepEqual(stack.GetLayerIds(), [project.header.id, profile.header.id]);
    assert.deepEqual(stack.GetSchemas(), profile.schemas);
    assert.equal(stack.GetFederatedLayer().data.length, project.data.length);
    const tree = stack.GetFullTree();
    const [root] = tree.children.values();
    assert.equal(tree.children.size, 1);
    assert.equal(root.attributes.get("openaec::opps::document").format, "IFCPP");
    assert.equal(countNodes(root), project.data.length);
    console.log(file + ": validated and composed " + project.data.length + " nodes");
  }

  const project = read("fixtures/minimal.ifcpp");
  assert.ok(await load(project, false) instanceof Error, "missing profile should fail");
  const cpt = project.data.find(({ attributes }) => attributes["openaec::cpt"]);
  cpt.attributes["openaec::cpt"].number = "not-an-integer";
  assert.ok(await load(project) instanceof Error, "mistyped CPT number should fail");
  console.log("Rejected an unavailable profile and a mistyped CPT number");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
