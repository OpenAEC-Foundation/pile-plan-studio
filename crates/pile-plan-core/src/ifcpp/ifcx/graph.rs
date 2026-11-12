use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use uuid::Uuid;

use super::{invalid, Result};

pub(super) const NAME: &str = "bsi::ifc::prop::Name";
pub(super) const CLASS: &str = "bsi::ifc::class";
pub(super) const DOCUMENT: &str = "openaec::opps::document";
pub(super) const DESIGN: &str = "openaec::foundation::design";
pub(super) const LOAD_POINT: &str = "openaec::foundation::loadPoint";
pub(super) const CPT: &str = "openaec::cpt";
pub(super) const PLAN: &str = "openaec::foundation::pilePlan";
pub(super) const PILE: &str = "openaec::foundation::pile";
pub(super) const ADVICE: &str = "openaec::foundation::bearingAdvice";
pub(super) const SOURCE: &str = "openaec::source::document";
pub(super) const EMBEDDED: &str = "openaec::source::embeddedFile";
pub(super) const EXTERNAL: &str = "openaec::source::externalReferences";
pub(super) const UNITS: &str = "openaec::project::units";
pub(super) const METADATA: &str = "openaec::project::metadata";
pub(super) const SELECTION: &str = "openaec::foundation::cptSelection";
pub(super) const ORDER: &str = "openaec::opps::inputOrder";

const PROFILE: &str = include_str!("../../../../../schemas/ifcpp/ifcpp-profile-1.0.0.ifcx");
const IFCX_VERSION: &str = "ifcx_alpha";

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Envelope {
    pub header: Header,
    pub imports: Vec<Import>,
    pub schemas: Map<String, Value>,
    pub data: Vec<Node>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Header {
    pub id: String,
    pub ifcx_version: String,
    pub data_version: String,
    pub author: String,
    pub timestamp: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Import {
    pub uri: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Node {
    pub path: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub children: BTreeMap<String, String>,
    #[serde(with = "super::decimal::attributes")]
    pub attributes: Map<String, Value>,
}

impl Node {
    pub fn new(path: String, name: &str) -> Self {
        let mut node = Self {
            path,
            children: BTreeMap::new(),
            attributes: Map::new(),
        };
        node.set(NAME, Value::from(name));
        node
    }

    pub fn set(&mut self, key: &str, value: Value) {
        if !value.is_null() {
            self.attributes.insert(key.to_owned(), value);
        }
    }

    pub fn set_opps(&mut self, key: &str, value: Value) {
        self.set(&format!("openaec::opps::{key}"), value);
    }

    pub fn get(&self, key: &str) -> &Value {
        self.attributes.get(key).unwrap_or(&Value::Null)
    }

    pub fn opps(&self, key: &str) -> &Value {
        self.get(&format!("openaec::opps::{key}"))
    }

    pub fn add_child(&mut self, name: &str, child: &Self) {
        let key: String = name
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let key = if key.is_empty() {
            "Item".to_owned()
        } else {
            key
        };
        let unique = if self.children.contains_key(&key) {
            (2..)
                .map(|suffix| format!("{key}_{suffix}"))
                .find(|candidate| !self.children.contains_key(candidate))
                .unwrap()
        } else {
            key
        };
        self.children.insert(unique, child.path.clone());
    }

    pub fn role(&self) -> Result<&'static str> {
        let roles = [
            DOCUMENT, DESIGN, LOAD_POINT, CPT, PLAN, PILE, ADVICE, SOURCE,
        ];
        let mut roles = roles
            .into_iter()
            .filter(|key| self.attributes.contains_key(*key));
        let role = roles
            .next()
            .ok_or_else(|| invalid(format!("node {} has no role", self.path)))?;
        if roles.next().is_some() {
            return Err(invalid(format!("node {} has multiple roles", self.path)));
        }
        Ok(role)
    }
}

#[derive(Deserialize)]
struct Profile {
    header: Header,
    schemas: BTreeMap<String, AttributeSchema>,
}

#[derive(Deserialize)]
struct AttributeSchema {
    value: Schema,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Schema {
    data_type: String,
    #[serde(default)]
    optional: bool,
    object_restrictions: Option<ObjectRestrictions>,
    array_restrictions: Option<ArrayRestrictions>,
    enum_restrictions: Option<EnumRestrictions>,
}

#[derive(Deserialize)]
struct ObjectRestrictions {
    values: BTreeMap<String, Schema>,
}

#[derive(Deserialize)]
struct ArrayRestrictions {
    value: Box<Schema>,
}

#[derive(Deserialize)]
struct EnumRestrictions {
    options: Vec<String>,
}

impl Schema {
    fn validate(&self, value: &Value, path: &str, graph: &Graph<'_>) -> Result<()> {
        let valid = match self.data_type.as_str() {
            "Object" => {
                let object = value
                    .as_object()
                    .ok_or_else(|| invalid(format!("{path} must be an object")))?;
                let fields = &self.object_restrictions.as_ref().unwrap().values;
                for (key, schema) in fields {
                    match object.get(key) {
                        Some(value) => schema.validate(value, &format!("{path}.{key}"), graph)?,
                        None if !schema.optional => {
                            return Err(invalid(format!("{path}.{key} is required")))
                        }
                        None => {}
                    }
                }
                object.keys().all(|key| fields.contains_key(key))
            }
            "Array" => {
                let items = value
                    .as_array()
                    .ok_or_else(|| invalid(format!("{path} must be an array")))?;
                let schema = &self.array_restrictions.as_ref().unwrap().value;
                for (index, item) in items.iter().enumerate() {
                    schema.validate(item, &format!("{path}[{index}]"), graph)?;
                }
                true
            }
            "Reference" => value
                .as_str()
                .is_some_and(|reference| graph.nodes.contains_key(reference)),
            "Enum" => value.as_str().is_some_and(|s| {
                self.enum_restrictions
                    .as_ref()
                    .unwrap()
                    .options
                    .iter()
                    .any(|option| s == option)
            }),
            "Integer" => value.is_i64() || value.is_u64(),
            // Decimal tip levels must reach the mapper as their original token.
            // Other reals are checked by their typed project fields.
            "Real" => value.is_number() || super::decimal::token(value).is_some(),
            "String" => value.is_string(),
            "Boolean" => value.is_boolean(),
            _ => false,
        };
        if valid {
            Ok(())
        } else {
            Err(invalid(format!("invalid {} at {path}", self.data_type)))
        }
    }
}

fn profile() -> &'static Profile {
    static PROFILE_SCHEMA: OnceLock<Profile> = OnceLock::new();
    PROFILE_SCHEMA
        .get_or_init(|| serde_json::from_str(PROFILE).expect("the bundled IFCX profile is valid"))
}

impl Envelope {
    pub fn new(id: String, author: String, timestamp: String, data: Vec<Node>) -> Self {
        let profile = profile();
        Self {
            header: Header {
                id,
                ifcx_version: IFCX_VERSION.into(),
                data_version: profile.header.data_version.clone(),
                author,
                timestamp,
            },
            imports: vec![Import {
                uri: profile.header.id.clone(),
            }],
            schemas: Map::new(),
            data,
        }
    }
}

pub(super) struct Graph<'a> {
    nodes: BTreeMap<&'a str, &'a Node>,
    pub root: &'a Node,
    pub foundation: &'a Node,
}

impl<'a> Graph<'a> {
    pub fn new(envelope: &'a Envelope) -> Result<Self> {
        let profile = profile();
        if envelope.header.ifcx_version != IFCX_VERSION
            || envelope.header.data_version != profile.header.data_version
            || envelope.imports.len() != 1
            || envelope.imports[0].uri != profile.header.id
            || !envelope.schemas.is_empty()
        {
            return Err(invalid("unsupported IFCX envelope or IFCPP profile"));
        }

        let mut nodes = BTreeMap::new();
        for node in &envelope.data {
            let valid_uuid =
                Uuid::parse_str(&node.path).is_ok_and(|uuid| uuid.to_string() == node.path);
            if !valid_uuid || nodes.insert(node.path.as_str(), node).is_some() {
                return Err(invalid(format!(
                    "invalid or duplicate node path {}",
                    node.path
                )));
            }
        }
        let lookup = |path: &str| {
            nodes
                .get(path)
                .copied()
                .ok_or_else(|| invalid(format!("missing node {path}")))
        };
        let root = lookup(&envelope.header.id)?;
        if root.role()? != DOCUMENT || root.children.len() != 1 {
            return Err(invalid("expected a project with one foundation"));
        }
        let foundation = lookup(root.children.values().next().unwrap())?;
        if foundation.role()? != DESIGN {
            return Err(invalid("expected a foundation under the project"));
        }
        let graph = Self {
            nodes,
            root,
            foundation,
        };

        // Structural ownership is a tree. Other relationships are validated as references.
        let mut pending = vec![root];
        let mut visited = BTreeSet::new();
        while let Some(node) = pending.pop() {
            if !visited.insert(node.path.as_str()) {
                return Err(invalid(format!(
                    "multiple structural owners for {}",
                    node.path
                )));
            }
            let role = node.role()?;
            let allowed: &[_] = match role {
                DOCUMENT => &[DESIGN],
                DESIGN => &[LOAD_POINT, CPT, PLAN, ADVICE, SOURCE],
                PLAN => &[PILE],
                _ => &[],
            };
            for child in node.children.values() {
                let target = graph.lookup(child)?;
                if !allowed.contains(&target.role()?) {
                    return Err(invalid(format!("invalid child {child} of {}", node.path)));
                }
                pending.push(target);
            }
            for (key, value) in &node.attributes {
                let schema = profile
                    .schemas
                    .get(key)
                    .ok_or_else(|| invalid(format!("unknown attribute {key}")))?;
                schema.value.validate(value, key, &graph)?;
            }
        }
        if visited.len() != graph.nodes.len() {
            return Err(invalid("unreachable IFCX nodes"));
        }
        Ok(graph)
    }

    fn lookup(&self, path: &str) -> Result<&'a Node> {
        self.nodes
            .get(path)
            .copied()
            .ok_or_else(|| invalid(format!("missing node {path}")))
    }

    pub fn target(&self, reference: &Value, role: &str) -> Result<&'a Node> {
        let path = reference
            .as_str()
            .ok_or_else(|| invalid(format!("expected reference to {role}")))?;
        let node = self.lookup(path)?;
        if node.role()? != role {
            return Err(invalid(format!("{path} must refer to {role}")));
        }
        Ok(node)
    }

    pub fn children<'b>(
        &'b self,
        node: &'b Node,
        role: &'b str,
    ) -> impl Iterator<Item = &'a Node> + 'b {
        node.children
            .values()
            .filter_map(|path| self.nodes.get(path.as_str()).copied())
            .filter(move |node| node.attributes.contains_key(role))
    }
}
